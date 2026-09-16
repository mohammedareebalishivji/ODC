import { useEffect, useRef } from 'react';
import { useAuth } from './state';

/**
 * Live server events over SSE.
 *
 * Read with a streaming fetch() rather than EventSource, because EventSource
 * cannot set request headers — which would have forced the access token into
 * the query string, where it ends up in access logs and Referer headers.
 * fetch() sends it in the Authorization header like every other call.
 *
 * The trade-off is that reconnection is ours to handle, so there is an
 * explicit backoff below.
 */
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export function useLiveEvents(handlers) {
  const { tokens } = useAuth();
  const accessToken = tokens?.accessToken;

  // Keep the latest handlers without restarting the stream on every render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!accessToken) return undefined;

    const controller = new AbortController();
    let retry = FIRST_RETRY_MS;
    let retryTimer = null;
    let stopped = false;

    async function connect() {
      try {
        const res = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);

        retry = FIRST_RETRY_MS; // a successful connect resets the backoff
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;

          // SSE frames are separated by a blank line.
          let split;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            dispatch(frame);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Network blip or server restart — fall through to the retry below.
      }
      if (!stopped && !controller.signal.aborted) {
        retryTimer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, MAX_RETRY_MS);
      }
    }

    function dispatch(frame) {
      let event = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue;               // keepalive comment
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) return;
      let payload;
      try { payload = JSON.parse(dataLines.join('\n')); } catch { return; }
      handlersRef.current?.[event]?.(payload);
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      controller.abort();
    };
  }, [accessToken]);
}

export default useLiveEvents;
