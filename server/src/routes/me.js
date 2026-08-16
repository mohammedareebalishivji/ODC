import { Router } from 'express';
import { db, audit } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { nowIso, uid, apiError, DEV } from '../config.js';
import { hashToken, randomToken, generateTotpSecret, verifyTotp } from '../security.js';
import { getVapidPublicKey, configurePush } from '../notify.js';
import { hashPassword, verifyPassword, assertStrongPassword, serializeUser, generateOtp, verifyOtp } from '../auth.js';

const router = Router();

const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanPhone = (v) => String(v || '').replace(/[^0-9+]/g, '').slice(0, 16);

const SPECIALTIES = [
  'Tandoor', 'Chinese', 'Continental', 'Italian', 'Bakery/Pastry',
  'South Indian', 'North Indian', 'BBQ/Grill', 'Multi-cuisine',
];
const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Bengali', 'Punjabi', 'Marathi'];

function fullUser(u) {
  const extra = {};
  if (u.role === 'manager') {
    const p = db.prepare(`SELECT * FROM manager_profiles WHERE user_id = ?`).get(u.id);
    Object.assign(extra, p || {});
  }
  if (u.role === 'chef') {
    const p = db.prepare(`SELECT * FROM chef_profiles WHERE user_id = ?`).get(u.id);
    Object.assign(extra, p || {});
    extra.specialties = p ? JSON.parse(p.specialties || '[]') : [];
  }
  if (u.role === 'waiter') {
    const p = db.prepare(`SELECT * FROM waiter_profiles WHERE user_id = ?`).get(u.id);
    Object.assign(extra, p || {});
    extra.languages = p ? JSON.parse(p.languages || '[]') : [];
  }
  const avg = db.prepare(
    `SELECT AVG(stars) avg, COUNT(*) n FROM ratings WHERE to_user = ?`
  ).get(u.id);
  return { ...serializeUser(u), ...extra, rating: { avg: avg.avg || 0, count: avg.n }, stats: workerStats(u.id) };
}

function workerStats(userId) {
  const done = db.prepare(`SELECT COUNT(*) n FROM shifts WHERE matched_worker_id = ? AND status = 'matched'`).get(userId);
  const earned = db.prepare(`SELECT COALESCE(SUM(agreed_pay),0) total FROM shifts WHERE matched_worker_id = ? AND status='matched'`).get(userId);
  return { completed: done.n, earned: earned.total };
}

router.get('/', authGuard(), asyncH(async (req, res) => {
  res.json({ user: fullUser(req.user), specialties: SPECIALTIES, languages: LANGUAGES });
}));

router.put('/', authGuard(), asyncH(async (req, res) => {
  const u = req.user;
  if (u.banned) throw apiError('This account has been banned.');
  if ('name' in req.body && clean(req.body.name).length >= 2) {
    db.prepare(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`).run(clean(req.body.name), nowIso(), u.id);
  }
  if (u.role === 'manager') {
    const fields = {};
    for (const k of ['businessName', 'businessType', 'businessAddress', 'licenseFile']) {
      if (k in req.body) fields[k] = clean(req.body[k]);
    }
    if (Object.keys(fields).length) {
      db.prepare(
        `UPDATE manager_profiles SET business_name = ?, business_type = ?, business_address = ?, license_file = ? WHERE user_id = ?`
      ).run(fields.businessName ?? db.prepare(`SELECT business_name FROM manager_profiles WHERE user_id=?`).get(u.id).business_name,
            fields.businessType ?? db.prepare(`SELECT business_type FROM manager_profiles WHERE user_id=?`).get(u.id).business_type,
            fields.businessAddress ?? db.prepare(`SELECT business_address FROM manager_profiles WHERE user_id=?`).get(u.id).business_address,
            fields.licenseFile ?? db.prepare(`SELECT license_file FROM manager_profiles WHERE user_id=?`).get(u.id).license_file,
            u.id);
    }
  }
  if (u.role === 'chef') {
    if (Array.isArray(req.body.specialties)) {
      const allowed = new Set(SPECIALTIES.map((s) => s.toLowerCase()));
      const keep = req.body.specialties.slice(0, 12).map(clean).filter((s) => allowed.has(s.toLowerCase()));
      db.prepare(`UPDATE chef_profiles SET specialties = ?, years_experience = ? WHERE user_id = ?`).run(
        JSON.stringify(keep),
        Number(req.body.yearsExperience) >= 0 ? Number(req.body.yearsExperience) : db.prepare(`SELECT years_experience FROM chef_profiles WHERE user_id=?`).get(u.id).years_experience,
        u.id
      );
    }
  }
  if (u.role === 'waiter') {
    if (Array.isArray(req.body.languages)) {
      const keep = req.body.languages.slice(0, 8).map(clean);
      db.prepare(`UPDATE waiter_profiles SET languages = ?, experience_level = ?, id_file = ? WHERE user_id = ?`).run(
        JSON.stringify(keep),
        clean(req.body.experienceLevel) || db.prepare(`SELECT experience_level FROM waiter_profiles WHERE user_id=?`).get(u.id).experience_level,
        ('idFile' in req.body) ? clean(req.body.idFile) : db.prepare(`SELECT id_file FROM waiter_profiles WHERE user_id=?`).get(u.id).id_file,
        u.id
      );
    }
  }
  if (typeof req.body.photoData === 'string') {
    db.prepare(`UPDATE users SET photo_data = ?, updated_at = ? WHERE id = ?`).run(req.body.photoData.slice(0, 300_000), nowIso(), u.id);
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id);
  res.json({ user: fullUser(row) });
}));

router.post('/password', authGuard(), asyncH(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { verifyPassword } = await import('../auth.js');
  if (!verifyPassword(String(currentPassword || ''), req.user.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  assertStrongPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    hashPassword(newPassword), nowIso(), req.user.id
  );
  db.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).run(req.user.id);
  audit('password_change', 'Password changed', req.user.id);
  res.json({ message: 'Password changed. Please log in again.' });
}));

router.post('/verify-profile', asyncH(async (req, res) => {
  const { phone, code } = req.body;
  const { verifyOtp } = await import('../auth.js');
  const r = verifyOtp(String(phone || ''), 'signup', String(code || ''));
  res.json(r.ok ? { ok: true } : { ok: false, reason: r.reason });
}));

router.post('/push-subscribe', authGuard(), asyncH(async (req, res) => {
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint) throw apiError('Invalid push subscription.');
  configurePush();
  const existing = db.prepare(`SELECT id FROM devices WHERE user_id = ? AND endpoint = ?`).get(req.user.id, sub.endpoint);
  const payload = { ...sub, userAgent: req.headers['user-agent'] || '' };
  if (existing) {
    db.prepare(`UPDATE devices SET subscription = ? WHERE id = ?`).run(JSON.stringify(payload), existing.id);
  } else {
    db.prepare(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES (?,?,?,?,?)`)
      .run(uid('dev'), req.user.id, clean(req.body.name, 40) || 'web', JSON.stringify(payload), nowIso());
  }
  res.json({ ok: true });
}));

router.get('/vapid', asyncH((_req, res) => {
  configurePush();
  res.json({ publicKey: getVapidPublicKey() });
}));

router.get('/notifications', authGuard(), asyncH(async (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  ).all(req.user.id);
  res.json({ notifications: rows.map((n) => ({
    id: n.id, title: n.title, body: n.body, type: n.type,
    data: n.data ? JSON.parse(n.data) : null, read: !!n.read, createdAt: n.created_at,
  })) });
}));

router.post('/notifications/read', authGuard(), asyncH(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length) {
    const stmt = db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`);
    for (const id of ids) stmt.run(id, req.user.id);
  } else {
    db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(req.user.id);
  }
  res.json({ ok: true });
}));

router.get('/sessions', authGuard(), asyncH(async (req, res) => {
  const rows = db.prepare(
    `SELECT id, device, created_at, expires_at FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC`
  ).all(req.user.id);
  res.json({ sessions: rows });
}));

router.delete('/sessions/:id', authGuard(), asyncH(async (req, res) => {
  db.prepare(`DELETE FROM refresh_tokens WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
}));

router.post('/availability', authGuard(['chef', 'waiter']), asyncH(async (req, res) => {
  const available = !!req.body.available;
  db.prepare(`UPDATE users SET available = ?, updated_at = ? WHERE id = ?`).run(available ? 1 : 0, nowIso(), req.user.id);
  audit('availability', available ? 'Marked self Free Now' : 'Marked self Not Available', req.user.id);
  res.json({ available });
}));

const PIN_RULES = 'Use 4–8 letters or numbers (no spaces or symbols).';
const requiredPassword = (req) => {
  if (!verifyPassword(String(req.body.currentPassword || ''), req.user.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
};

router.post('/pin', authGuard(), asyncH(async (req, res) => {
  const pin = clean(String(req.body.pin || ''), 8);
  if (!/^[A-Za-z0-9]{4,8}$/.test(pin)) throw apiError(PIN_RULES);
  requiredPassword(req);
  db.prepare(`UPDATE users SET login_pin = ?, pin_enabled = 1, updated_at = ? WHERE id = ?`).run(hashToken(pin), nowIso(), req.user.id);
  audit('pin_set', 'Personal login PIN set', req.user.id);
  res.json({ user: serializeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
}));

router.post('/pin/clear', authGuard(), asyncH(async (req, res) => {
  requiredPassword(req);
  db.prepare(`UPDATE users SET login_pin = NULL, pin_enabled = 0, updated_at = ? WHERE id = ?`).run(nowIso(), req.user.id);
  audit('pin_cleared', 'Personal login PIN removed', req.user.id);
  res.json({ user: serializeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
}));

router.post('/email', authGuard(), asyncH(async (req, res) => {
  requiredPassword(req);
  const email = clean(String(req.body.email || ''), 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('That email address does not look right.');
  const dupe = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(email, req.user.id);
  if (dupe) throw apiError('That email is already used by another account.');
  db.prepare(`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`).run(email, nowIso(), req.user.id);
  audit('email_changed', `Email changed to ${email}`, req.user.id);
  res.json({ user: serializeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
}));

router.post('/phone/request', authGuard(), asyncH(async (req, res) => {
  requiredPassword(req);
  const phone = cleanPhone(req.body.newPhone);
  if (!/^\+?[0-9]{8,15}$/.test(phone)) throw apiError('Please enter a valid phone number.');
  const dupe = db.prepare(`SELECT id FROM users WHERE phone = ? AND id != ?`).get(phone, req.user.id);
  if (dupe) throw apiError('That phone number is already registered to another account.');
  const devCode = generateOtp(phone, 'phone_change');
  audit('phone_change_request', `Phone change requested to ${phone}`, req.user.id);
  res.json({ message: 'We sent a code to the new number.' + (devCode ? ` Dev code: ${devCode}` : ''), devCode });
}));

router.post('/phone/confirm', authGuard(), asyncH(async (req, res) => {
  const phone = cleanPhone(req.body.newPhone);
  const code = String(req.body.code || '').trim();
  const r = verifyOtp(phone, 'phone_change', code);
  if (!r.ok) throw apiError(r.reason);
  db.prepare(`UPDATE users SET phone = ?, updated_at = ? WHERE id = ?`).run(phone, nowIso(), req.user.id);
  audit('phone_changed', `Phone changed to ${phone}`, req.user.id);
  res.json({ user: serializeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
}));

function otpauthUri(email, secret) {
  const label = encodeURIComponent(`${email || 'user@odc.in'}`);
  return `otpauth://totp/O.D.C:${label}?secret=${encodeURIComponent(secret)}&issuer=O.D.C&algorithm=SHA1&digits=6&period=30`;
}

router.post('/totp/setup', authGuard(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (u.totp_secret && u.totp_enabled) throw apiError('Authenticator is already on. Disable it first to change the secret.');
  requiredPassword(req);
  const secret = u.totp_secret || generateTotpSecret();
  db.prepare(`UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?`).run(secret, nowIso(), u.id);
  audit('totp_setup', 'Authenticator setup started', req.user.id);
  res.json({ secret, otpauth: otpauthUri(u.email, secret) });
}));

router.post('/totp/confirm', authGuard(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!u.totp_secret) throw apiError('Start the authenticator setup first.');
  if (u.totp_enabled) throw apiError('Authenticator is already on.');
  if (!verifyTotp(u.totp_secret, String(req.body.code || '').trim())) {
    throw apiError("That code didn't match your authenticator app — try again.");
  }
  db.prepare(`UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?`).run(nowIso(), u.id);
  audit('totp_enabled', 'Authenticator 2FA enabled', req.user.id);
  res.json({ user: serializeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id)) });
}));

router.post('/totp/disable', authGuard(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!u.totp_enabled) throw apiError('Authenticator is not on.');
  requiredPassword(req);
  if (!verifyTotp(u.totp_secret, String(req.body.code || '').trim())) {
    throw apiError("That code didn't match your authenticator app — try again.");
  }
  db.prepare(`UPDATE users SET totp_secret = NULL, totp_enabled = 0, updated_at = ? WHERE id = ?`).run(nowIso(), u.id);
  audit('totp_disabled', 'Authenticator 2FA disabled', req.user.id);
  res.json({ user: serializeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id)) });
}));

router.post('/delete-account', authGuard(), asyncH(async (req, res) => {
  const { verifyPassword } = await import('../auth.js');
  if (!verifyPassword(String(req.body.password || ''), req.user.password_hash)) {
    throw apiError('Password is not correct.');
  }
  audit('delete_account', 'Account deleted by user', req.user.id);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(req.user.id);
  res.json({ ok: true });
}));

export default router;