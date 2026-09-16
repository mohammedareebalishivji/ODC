import { Router } from 'express';
import { authGuard } from '../middleware.js';
import { subscribe, EVENT } from '../events.js';
import { touchPresence, clearPresence } from '../presence.js';

const router = Router();

// Proxies and load balancers commonly cut idle connections at 30-60s. A
// comment line every 25s keeps the stream alive without waking the UI.
const KEEPALIVE_MS = 25_000;

/**
 * Server-Sent Events stream.
 *
 * SSE rather than WebSockets because the traffic is one-directional (server
 * to browser) and it rides the existing authenticated /api channel. A
 * WebSocket would need its own auth handshake for no benefit here.
 *
 * The client reads this with a streaming fetch() rather than EventSource.
 * EventSource cannot set request headers, which would have forced the access
 * token into the query string — where it lands in access logs, proxy logs and
 * Referer headers. fetch() sends it in the Authorization header like every
 * other call, so this route needs no special auth path at all.
 */
router.get('/', authGuard(), (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Without this, nginx buffers the stream and nothing arrives until close.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('ready', { userId: req.user.id, at: new Date().toISOString() });

  const unsubscribe = subscribe(req.user.id, (evt) => {
    try {
      send(evt.type, { ...evt.payload, at: evt.at });
    } catch {
      /* the socket is gone; the close handler below cleans up */
    }
  });

  // An open stream is the most reliable presence signal there is — it lasts
  // exactly as long as the tab is open.
  touchPresence(req.user.id).catch(() => { /* presence is best-effort */ });
  const presenceTimer = setInterval(() => {
    touchPresence(req.user.id).catch(() => {});
  }, 30_000);

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, KEEPALIVE_MS);

  req.on('close', () => {
    clearInterval(keepalive);
    clearInterval(presenceTimer);
    unsubscribe();
    clearPresence(req.user.id).catch(() => {});
    res.end();
  });
});

export default router;
export { EVENT };
