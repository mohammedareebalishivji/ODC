import { db, audit } from './db.js';
import { notifyUser } from './notify.js';

const EXPIRY_MS = 12 * 60 * 60 * 1000;
const WARN_MS = 2 * 60 * 60 * 1000;

export async function expirePastShifts() {
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const open = await db.all(`SELECT * FROM shifts WHERE status = 'open'`);
  let expired = 0;
  for (const s of open) {
    const remaining = new Date(s.expires_at).getTime() - now;
    if (remaining <= 0) {
      await db.run(`UPDATE shifts SET status = 'expired' WHERE id = $1`, s.id);
      await db.run(`UPDATE responses SET status = 'declined' WHERE shift_id = $1 AND status = 'pending'`, s.id);
      await notifyUser(s.manager_id, 'notif.shiftClosed.title', 'notif.shiftClosed.body', 'shift_expired', { shiftId: s.id });
      await audit('shift_expired', `Shift ${s.id} auto-expired after 12h`, s.manager_id);
      expired++;
    } else if (!s.warned_soon && remaining <= WARN_MS) {
      const mins = Math.ceil(remaining / 60000);
      await db.run(`UPDATE shifts SET warned_soon = 1 WHERE id = $1`, s.id);
      await notifyUser(s.manager_id, 'notif.expiringSoon.title', 'notif.expiringSoon.body', 'expiring_soon', { shiftId: s.id });
    }
  }

  await db.run(`DELETE FROM refresh_tokens WHERE expires_at < $1`, nowIso);
  if (expired) console.log(`[job] expired ${expired} shift(s)`);
}

export function startJobs() {
  expirePastShifts();
  setInterval(expirePastShifts, 60_000).unref();
}
