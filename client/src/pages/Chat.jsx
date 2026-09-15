import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { chat } from '../apiEndpoints';
import { Card, EmptyState, toast } from '../ui';

/**
 * ShiftConnect — the real-time crew/operations hub.
 *
 * Threads are per shift. Polling (rather than sockets) keeps this consistent
 * with how the rest of the app talks to the server; the interval only runs
 * while a thread is open.
 */
const POLL_MS = 8000;

export default function Chat() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await chat.list();
      setConversations(r.conversations || []);
    } catch (err) {
      toast(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMessages = useCallback(async (id) => {
    if (!id) return;
    try {
      const r = await chat.messages(id);
      setMessages(r.messages || []);
    } catch (err) {
      toast(err.message || t('common.error'));
    }
  }, [t]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return undefined;
    }
    loadMessages(activeId);
    const id = setInterval(() => loadMessages(activeId), POLL_MS);
    return () => clearInterval(id);
  }, [activeId, loadMessages]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send(ev) {
    ev.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setSending(true);
    try {
      const msg = await chat.send(activeId, body);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      loadConversations();
    } catch (err) {
      toast(err.message || t('common.error'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-wrap">
      <header className="chat-head">
        <h1 className="chat-title">{t('chat.title')}</h1>
        <p className="chat-sub">{t('chat.subtitle')}</p>
      </header>

      <div className="chat-layout">
        <aside className="chat-threads" aria-label={t('chat.title')}>
          {loading ? (
            <div className="skeleton" style={{ height: 72 }} />
          ) : conversations.length === 0 ? (
            <Card className="pay-empty">{t('chat.empty')}</Card>
          ) : (
            <ul className="chat-thread-list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`chat-thread ${activeId === c.id ? 'on' : ''}`}
                    onClick={() => setParams({ c: c.id })}
                    aria-current={activeId === c.id}
                  >
                    <span className="chat-thread-top">
                      <span className="chat-thread-title">{c.topic || t('chat.title')}</span>
                      {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
                    </span>
                    <span className="chat-thread-last">
                      {c.lastMessage || t('chat.empty')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="chat-panel" aria-live="polite">
          {!activeId ? (
            <EmptyState title={t('chat.title')} sub={t('chat.empty')} />
          ) : (
            <>
              <div className="chat-stream">
                {messages.map((m) => (
                  <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}>
                    {!m.mine && <p className="chat-msg-who">{m.senderName}</p>}
                    <p className="chat-msg-body">{m.body}</p>
                    <time className="chat-msg-time" dateTime={m.createdAt}>
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <form className="chat-compose" onSubmit={send}>
                <label className="sr-only" htmlFor="chat-input">
                  {t('chat.placeholder')}
                </label>
                <input
                  id="chat-input"
                  className="input chat-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('chat.placeholder')}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={sending || !draft.trim()}
                >
                  {t('chat.send')}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
