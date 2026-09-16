import { db } from './db.js';
import { publish, EVENT } from './events.js';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from './config.js';

/**
 * Supabase Realtime -> local event bus.
 *
 * This exists only for running more than one API instance. A single instance
 * already publishes its own writes to the bus in-process, which is faster and
 * needs no extra moving parts; without this module the app is still fully
 * real-time for one instance.
 *
 * With several instances behind a load balancer, a browser's SSE stream is
 * held by whichever instance it happened to connect to, which is usually not
 * the one handling the write. Supabase Realtime reads the WAL and tells every
 * instance, so each can fan out to the connections it owns.
 *
 * Deliberately optional and fail-soft: no key, no subscription, no crash. The
 * app degrades to single-instance behaviour rather than refusing to start.
 */

let channel = null;

const WATCHED = ['messages', 'notifications', 'responses', 'user_presence'];

export async function startRealtime() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log('[realtime] Not configured — running single-instance (in-process events only).');
    console.log('[realtime] Set SUPABASE_URL and SUPABASE_SERVICE_KEY to fan out across instances.');
    return null;
  }

  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch {
    console.warn('[realtime] @supabase/supabase-js is not installed — skipping.');
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  channel = supabase.channel('odc-db-changes');
  for (const table of WATCHED) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (msg) => {
        // Never throw into the realtime client's callback — an error here
        // would tear down the whole subscription.
        handleChange(table, msg).catch((err) =>
          console.error(`[realtime] ${table} handler failed: ${err.message}`));
      }
    );
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log(`[realtime] Subscribed to ${WATCHED.join(', ')}.`);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`[realtime] Subscription ${status} — falling back to in-process events.`);
    }
  });

  return channel;
}

export async function stopRealtime() {
  try { await channel?.unsubscribe(); } catch { /* already gone */ }
  channel = null;
}

/**
 * Translate a row change into a bus event with the right audience.
 *
 * The audience is resolved from the database rather than taken from the
 * payload, because who is allowed to see a row is a property of the data, not
 * of the message that announced it.
 */
async function handleChange(table, msg) {
  const row = msg.new ?? msg.old;
  if (!row) return;

  if (table === 'messages' && msg.eventType === 'INSERT') {
    const members = await db.all(
      `SELECT user_id FROM conversation_members WHERE conversation_id = $1`,
      row.conversation_id
    );
    publish(EVENT.CHAT_MESSAGE, members.map((m) => m.user_id), {
      conversationId: row.conversation_id,
      messageId: row.id,
      senderId: row.sender_id,
    });
    return;
  }

  if (table === 'notifications' && msg.eventType === 'INSERT') {
    publish(EVENT.NOTIFICATION, [row.user_id], { notificationId: row.id });
    return;
  }

  if (table === 'responses') {
    const shift = await db.get(`SELECT manager_id FROM shifts WHERE id = $1`, row.shift_id);
    if (shift) publish(EVENT.SHIFT_RESPONSE, [shift.manager_id], { shiftId: row.shift_id });
    return;
  }

  if (table === 'user_presence') {
    const shifts = await db.all(
      `SELECT manager_id, matched_worker_id FROM shifts
        WHERE status = 'matched' AND (manager_id = $1 OR matched_worker_id = $1)`,
      row.user_id
    );
    const audience = new Set();
    for (const s of shifts) {
      if (s.manager_id !== row.user_id) audience.add(s.manager_id);
      if (s.matched_worker_id && s.matched_worker_id !== row.user_id) audience.add(s.matched_worker_id);
    }
    publish(EVENT.PRESENCE, [...audience], {
      userId: row.user_id,
      status: row.status,
      shiftId: row.shift_id,
    });
  }
}
