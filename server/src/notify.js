import webpush from 'web-push';
import { db } from './db.js';
import { uid, nowIso, DEV } from './config.js';

let configured = false;

export async function configurePush() {
  if (configured) return;
  const row = await db.get(`SELECT value FROM app_meta WHERE key = 'vapid_private'`);
  if (!row || !row.value) {
    const keys = webpush.generateVAPIDKeys();
    await db.run(`INSERT INTO app_meta (key, value) VALUES ('vapid_public',$1)`, keys.publicKey);
    await db.run(`INSERT INTO app_meta (key, value) VALUES ('vapid_private',$1)`, keys.privateKey);
    if (DEV) console.log('[push] VAPID keys generated.');
  }
  const pub = await db.get(`SELECT value FROM app_meta WHERE key = 'vapid_public'`);
  const priv = row ? row : await db.get(`SELECT value FROM app_meta WHERE key='vapid_private'`);
  webpush.setVapidDetails('mailto:ops@odc-internal.com', pub.value, priv.value);
  configured = true;
}

export async function getVapidPublicKey() {
  await configurePush();
  const row = await db.get(`SELECT value FROM app_meta WHERE key = 'vapid_public'`);
  return row.value;
}

export async function notifyUser(userId, title, body, type = null, data = null) {
  await db.run(
    `INSERT INTO notifications (id, user_id, title, body, type, data, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    uid('ntf'), userId, title, body, type, data ? JSON.stringify(data) : null, nowIso()
  );

  const devices = await db.all(`SELECT subscription FROM devices WHERE user_id = $1`, userId);
  for (const d of devices) {
    if (!d.subscription) continue;
    const payload = JSON.stringify({ title, body, data: data || {} });
    webpush
      .sendNotification(JSON.parse(d.subscription), payload)
      .catch(() => {});
  }
}

export async function notifyMatchingWorkers(shift) {
  const role = shift.role;
  const workers = await db.all(
    `SELECT u.id FROM users u WHERE u.role = $1 AND u.active = 1 AND u.suspended = 0 AND u.banned = 0
     AND u.available = 1
     AND EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id)`,
    role
  );

  for (const w of workers) {
    let match = true;
    if (role === 'chef' && shift.specialty) {
      const prof = await db.get(`SELECT specialties FROM chef_profiles WHERE user_id = $1`, w.id);
      const tags = prof ? JSON.parse(prof.specialties || '[]') : [];
      const anyMatch = tags.some(
        (t) => String(t).toLowerCase() === String(shift.specialty).toLowerCase()
      );
      if (!anyMatch) match = false;
    }
    if (!match) continue;
    await notifyUser(
      w.id,
      'New shift near you',
      `${role === 'chef' ? 'Chef' : 'Waiter'} needed ${shift.location_name ? 'at ' + shift.location_name : ''} — $${shift.pay_min}–$${shift.pay_max}`,
      'new_shift',
      { shiftId: shift.id }
    );
  }
}
