import { db } from './db.js';
import { nowIso } from './config.js';
import { publish, EVENT } from './events.js';

/**
 * Who is online, and who is on site.
 *
 * Presence is a claim with an expiry, never a bare flag. A browser that is
 * closed, crashes, or loses signal never sends "offline", so a status column
 * on its own would leave people showing as online indefinitely — which is
 * worse than showing nothing, because a venue would rely on it.
 *
 * Every read therefore checks `expires_at`, and a stale row is reported as
 * offline regardless of what `status` says.
 */

// Comfortably longer than the 30s SSE heartbeat, so one missed beat (a tunnel,
// a backgrounded tab) does not flap someone offline.
const TTL_MS = 90_000;

function serialize(row) {
  const live = row && new Date(row.expires_at).getTime() > Date.now();
  return {
    userId: row?.user_id,
    status: live ? row.status : 'offline',
    shiftId: live ? row.shift_id : null,
    lastSeenAt: row?.last_seen_at ?? null,
  };
}

/** Heartbeat. Called when an SSE stream opens and every 30s after. */
export async function touchPresence(userId, { status = 'online', shiftId = null } = {}) {
  const now = nowIso();
  const expires = new Date(Date.now() + TTL_MS).toISOString();

  const before = await db.get(
    `SELECT status, shift_id, expires_at FROM user_presence WHERE user_id = $1`,
    userId
  );

  await db.run(
    `INSERT INTO user_presence (user_id, status, shift_id, last_seen_at, expires_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$4)
     ON CONFLICT (user_id) DO UPDATE
       SET status = EXCLUDED.status,
           shift_id = COALESCE(EXCLUDED.shift_id, user_presence.shift_id),
           last_seen_at = EXCLUDED.last_seen_at,
           expires_at = EXCLUDED.expires_at,
           updated_at = EXCLUDED.updated_at`,
    userId, status, shiftId, now, expires
  );

  // Only announce a real transition. A heartbeat every 30s per user would
  // otherwise flood every watching connection with no new information.
  const wasLive = before && new Date(before.expires_at).getTime() > Date.now();
  const changed = !wasLive || before.status !== status
    || (shiftId && before.shift_id !== shiftId);
  if (changed) await broadcast(userId, { status, shiftId });
}

/** Called when the SSE stream closes — the tab was closed or navigated away. */
export async function clearPresence(userId) {
  await db.run(
    `UPDATE user_presence
        SET status = 'offline', shift_id = NULL, expires_at = $2, updated_at = $2
      WHERE user_id = $1`,
    userId, nowIso()
  );
  await broadcast(userId, { status: 'offline', shiftId: null });
}

/** Read presence for a set of users, expiry-aware. */
export async function getPresence(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await db.all(
    `SELECT * FROM user_presence WHERE user_id = ANY($1::text[])`,
    ids
  );
  const found = new Map(rows.map((r) => [r.user_id, serialize(r)]));
  // A user with no row has simply never connected — report them, don't omit
  // them, so the caller doesn't have to special-case a missing key.
  return ids.map((id) => found.get(id) ?? { userId: id, status: 'offline', shiftId: null, lastSeenAt: null });
}

/**
 * Tell the people who have a legitimate reason to see this user's status:
 * whoever shares a confirmed shift with them. Presence is not public — a
 * worker's online status is not the whole platform's business.
 */
async function broadcast(userId, state) {
  const rows = await db.all(
    `SELECT manager_id, matched_worker_id
       FROM shifts
      WHERE status = 'matched'
        AND (manager_id = $1 OR matched_worker_id = $1)`,
    userId
  );
  const audience = new Set();
  for (const r of rows) {
    if (r.manager_id && r.manager_id !== userId) audience.add(r.manager_id);
    if (r.matched_worker_id && r.matched_worker_id !== userId) audience.add(r.matched_worker_id);
  }
  publish(EVENT.PRESENCE, [...audience], { userId, ...state });
}

/** Periodic sweep so expired rows settle to 'offline' in the table itself. */
export async function sweepPresence() {
  const { changes } = await db.run(
    `UPDATE user_presence
        SET status = 'offline', shift_id = NULL, updated_at = $1
      WHERE status <> 'offline' AND expires_at < $1`,
    nowIso()
  );
  if (changes) console.log(`[presence] swept ${changes} stale row(s)`);
}
