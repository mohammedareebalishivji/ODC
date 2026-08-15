import webpush from 'web-push';
import { db } from './db.js';
import { uid, nowIso, DEV } from './config.js';

let configured = false;

export function configurePush() {
  if (configured) return;
  const row = db.prepare(`SELECT value FROM app_meta WHERE key = 'vapid_private'`).get();
  if (!row || !row.value) {
    const keys = webpush.generateVAPIDKeys();
    db.prepare(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('vapid_public',?)`).run(keys.publicKey);
    db.prepare(`INSERT INTO app_meta (key, value) VALUES ('vapid_private',?)`).run(keys.privateKey);
    if (DEV) console.log('[push] VAPID keys generated.');
  }
  const pub = db.prepare(`SELECT value FROM app_meta WHERE key = 'vapid_public'`).get();
  webpush.setVapidDetails('mailto:ops@odc-internal.com', pub.value, row ? row.value : db.prepare(`SELECT value FROM app_meta WHERE key='vapid_private'`).get().value);
  configured = true;
}

export function getVapidPublicKey() {
  configurePush();
  return db.prepare(`SELECT value FROM app_meta WHERE key = 'vapid_public'`).get().value;
}

export function notifyUser(userId, title, body, type = null, data = null) {
  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, type, data, created_at) VALUES (?,?,?,?,?,?,?)`
  ).run(uid('ntf'), userId, title, body, type, data ? JSON.stringify(data) : null, nowIso());

  const devices = db.prepare(`SELECT subscription FROM devices WHERE user_id = ?`).all(userId);
  for (const d of devices) {
    if (!d.subscription) continue;
    const payload = JSON.stringify({ title, body, data: data || {} });
    webpush
      .sendNotification(JSON.parse(d.subscription), payload)
      .catch(() => {});
  }
}

export function notifyMatchingWorkers(shift) {
  const role = shift.role;
  const workers = db.prepare(
    `SELECT u.id FROM users u WHERE u.role = ? AND u.active = 1 AND u.suspended = 0 AND u.banned = 0
     AND u.available = 1
     AND EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id)`
  ).all(role);

  for (const w of workers) {
    let match = true;
    if (role === 'chef' && shift.specialty) {
      const prof = db.prepare(`SELECT specialties FROM chef_profiles WHERE user_id = ?`).get(w.id);
      const tags = prof ? JSON.parse(prof.specialties || '[]') : [];
      const anyMatch = tags.some(
        (t) => String(t).toLowerCase() === String(shift.specialty).toLowerCase()
      );
      if (!anyMatch) match = false;
    }
    if (!match) continue;
    notifyUser(
      w.id,
      'New shift near you',
      `${role === 'chef' ? 'Chef' : 'Waiter'} needed ${shift.location_name ? 'at ' + shift.location_name : ''} — $${shift.pay_min}–$${shift.pay_max}`,
      'new_shift',
      { shiftId: shift.id }
    );
  }
}