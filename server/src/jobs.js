import { db, audit } from './db.js';
import { notifyUser } from './notify.js';

const EXPIRY_MS = 12 * 60 * 60 * 1000;
const WARN_MS = 2 * 60 * 60 * 1000;

export function expirePastShifts() {
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const open = db.prepare(`SELECT * FROM shifts WHERE status = 'open'`).all();
  let expired = 0;
  for (const s of open) {
    const remaining = new Date(s.expires_at).getTime() - now;
    if (remaining <= 0) {
      db.prepare(`UPDATE shifts SET status = 'expired' WHERE id = ?`).run(s.id);
      db.prepare(`UPDATE responses SET status = 'declined' WHERE shift_id = ? AND status = 'pending'`).run(s.id);
      notifyUser(s.manager_id, 'Shift closed', 'No one accepted this shift in 12 hours, so it was removed.', 'shift_expired', { shiftId: s.id });
      audit('shift_expired', `Shift ${s.id} auto-expired after 12h`, s.manager_id);
      expired++;
    } else if (!s.warned_soon && remaining <= WARN_MS) {
      const mins = Math.ceil(remaining / 60000);
      db.prepare(`UPDATE shifts SET warned_soon = 1 WHERE id = ?`).run(s.id);
      notifyUser(s.manager_id, 'Expiring soon', `Your shift closes in ${mins} min if no one accepts.`, 'expiring_soon', { shiftId: s.id });
    }
  }

  db.prepare(`DELETE FROM refresh_tokens WHERE expires_at < ?`).run(nowIso);
  if (expired) console.log(`[job] expired ${expired} shift(s)`);
}

export function startJobs() {
  expirePastShifts();
  setInterval(expirePastShifts, 60_000).unref();
}