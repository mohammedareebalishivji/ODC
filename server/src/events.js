import { EventEmitter } from 'node:events';

/**
 * Real-time fan-out.
 *
 * Two producers feed one bus:
 *
 *   1. This process, which performs every write and therefore already knows
 *      the instant anything changes. Zero latency, no extra infrastructure.
 *   2. Supabase Realtime (realtime.js), which reports changes made by *other*
 *      API instances. Only needed when more than one instance is running.
 *
 * Consumers are SSE connections held open by routes/events.js.
 *
 * Every event carries an explicit audience. Nothing is broadcast to all
 * connections by default: this bus can carry escrow amounts and shift
 * details, so the delivery rule is "only to the users named on the event",
 * and getting that wrong leaks one venue's business to another.
 */
const bus = new EventEmitter();
// One SSE connection per browser tab; a user with three tabs has three.
bus.setMaxListeners(0);

export const EVENT = {
  CHAT_MESSAGE: 'chat.message',
  NOTIFICATION: 'notification',
  SHIFT_RESPONSE: 'shift.response',
  SHIFT_UPDATED: 'shift.updated',
  PRESENCE: 'presence',
  PAYMENT: 'payment',
};

/**
 * Publish to a specific set of users.
 *
 * @param {string}   type      one of EVENT
 * @param {string[]} audience  user ids allowed to receive this
 * @param {object}   payload   plain JSON, already serialised for the client
 */
export function publish(type, audience, payload) {
  const to = [...new Set((audience || []).filter(Boolean))];
  if (to.length === 0) return;
  bus.emit('event', { type, audience: to, payload, at: new Date().toISOString() });
}

/** Subscribe a single SSE connection. Returns an unsubscribe function. */
export function subscribe(userId, onEvent) {
  const handler = (evt) => {
    if (!evt.audience.includes(userId)) return;
    onEvent(evt);
  };
  bus.on('event', handler);
  return () => bus.off('event', handler);
}

/** Current SSE listener count — surfaced on /health for debugging. */
export function listenerCount() {
  return bus.listenerCount('event');
}
