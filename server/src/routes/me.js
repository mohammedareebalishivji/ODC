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

async function fullUser(u) {
  const extra = {};
  if (u.role === 'manager') {
    const p = await db.get(`SELECT * FROM manager_profiles WHERE user_id = $1`, u.id);
    if (p) {
      extra.businessName = p.business_name;
      extra.businessType = p.business_type;
      extra.businessAddress = p.business_address;
      extra.licenseFile = p.license_file;
    }
  }
  if (u.role === 'chef') {
    const p = await db.get(`SELECT * FROM chef_profiles WHERE user_id = $1`, u.id);
    if (p) {
      extra.specialties = JSON.parse(p.specialties || '[]');
      extra.yearsExperience = p.years_experience;
      extra.certFile = p.cert_file;
    }
  }
  if (u.role === 'waiter') {
    const p = await db.get(`SELECT * FROM waiter_profiles WHERE user_id = $1`, u.id);
    if (p) {
      extra.experienceLevel = p.experience_level;
      extra.languages = JSON.parse(p.languages || '[]');
      extra.idFile = p.id_file;
    }
  }
  const avg = await db.get(
    `SELECT AVG(stars)::float avg, COUNT(*)::int n FROM ratings WHERE to_user = $1`, u.id
  );
  return { ...serializeUser(u), ...extra, rating: { avg: avg.avg || 0, count: avg.n }, stats: await workerStats(u.id) };
}

async function workerStats(userId) {
  const done = await db.get(`SELECT COUNT(*)::int n FROM shifts WHERE matched_worker_id = $1 AND status = 'matched'`, userId);
  const earned = await db.get(`SELECT COALESCE(SUM(agreed_pay),0) total FROM shifts WHERE matched_worker_id = $1 AND status='matched'`, userId);
  return { completed: done.n, earned: earned.total };
}

router.get('/', authGuard(), asyncH(async (req, res) => {
  res.json({ user: await fullUser(req.user), specialties: SPECIALTIES, languages: LANGUAGES });
}));

router.put('/', authGuard(), asyncH(async (req, res) => {
  const u = req.user;
  if (u.banned) throw apiError('This account has been banned.');
  if ('name' in req.body && clean(req.body.name).length >= 2) {
    await db.run(`UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`, clean(req.body.name), nowIso(), u.id);
  }
  if (u.role === 'manager') {
    const current = await db.get(`SELECT * FROM manager_profiles WHERE user_id = $1`, u.id);
    await db.run(
      `UPDATE manager_profiles SET business_name = $1, business_type = $2, business_address = $3, license_file = $4 WHERE user_id = $5`,
      ('businessName' in req.body ? clean(req.body.businessName) : current.business_name),
      ('businessType' in req.body ? clean(req.body.businessType) : current.business_type),
      ('businessAddress' in req.body ? clean(req.body.businessAddress) : current.business_address),
      ('licenseFile' in req.body ? clean(req.body.licenseFile) : current.license_file),
      u.id
    );
  }
  if (u.role === 'chef') {
    if (Array.isArray(req.body.specialties)) {
      const allowed = new Set(SPECIALTIES.map((s) => s.toLowerCase()));
      const keep = req.body.specialties.slice(0, 12).map((v) => clean(v)).filter((s) => allowed.has(s.toLowerCase()));
      const current = await db.get(`SELECT * FROM chef_profiles WHERE user_id = $1`, u.id);
      await db.run(`UPDATE chef_profiles SET specialties = $1, years_experience = $2 WHERE user_id = $3`,
        JSON.stringify(keep),
        Number(req.body.yearsExperience) >= 0 ? Number(req.body.yearsExperience) : current.years_experience,
        u.id
      );
    }
  }
  if (u.role === 'waiter') {
    if (Array.isArray(req.body.languages)) {
      const keep = req.body.languages.slice(0, 8).map((v) => clean(v));
      const current = await db.get(`SELECT * FROM waiter_profiles WHERE user_id = $1`, u.id);
      await db.run(`UPDATE waiter_profiles SET languages = $1, experience_level = $2, id_file = $3 WHERE user_id = $4`,
        JSON.stringify(keep),
        clean(req.body.experienceLevel) || current.experience_level,
        ('idFile' in req.body) ? clean(req.body.idFile) : current.id_file,
        u.id
      );
    }
  }
  if (typeof req.body.photoData === 'string') {
    await db.run(`UPDATE users SET photo_data = $1, updated_at = $2 WHERE id = $3`, req.body.photoData.slice(0, 300_000), nowIso(), u.id);
  }
  const row = await db.get(`SELECT * FROM users WHERE id = $1`, u.id);
  res.json({ user: await fullUser(row) });
}));

router.post('/password', authGuard(), asyncH(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!verifyPassword(String(currentPassword || ''), req.user.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  assertStrongPassword(newPassword);
  await db.run(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
    hashPassword(newPassword), nowIso(), req.user.id
  );
  await db.run(`DELETE FROM refresh_tokens WHERE user_id = $1`, req.user.id);
  await audit('password_change', 'Password changed', req.user.id);
  res.json({ message: 'Password changed. Please log in again.' });
}));

router.post('/verify-profile', asyncH(async (req, res) => {
  const { phone, code } = req.body;
  const r = await verifyOtp(String(phone || ''), 'signup', String(code || ''));
  res.json(r.ok ? { ok: true } : { ok: false, reason: r.reason });
}));

router.post('/push-subscribe', authGuard(), asyncH(async (req, res) => {
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint) throw apiError('Invalid push subscription.');
  await configurePush();
  const devices = await db.all(`SELECT * FROM devices WHERE user_id = $1`, req.user.id);
  const existing = devices.find((d) => d.subscription && JSON.parse(d.subscription).endpoint === sub.endpoint);
  const payload = { ...sub, userAgent: req.headers['user-agent'] || '' };
  if (existing) {
    await db.run(`UPDATE devices SET subscription = $1 WHERE id = $2`, JSON.stringify(payload), existing.id);
  } else {
    await db.run(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES ($1,$2,$3,$4,$5)`,
      uid('dev'), req.user.id, clean(req.body.name, 40) || 'web', JSON.stringify(payload), nowIso()
    );
  }
  res.json({ ok: true });
}));

router.get('/vapid', asyncH(async (_req, res) => {
  await configurePush();
  res.json({ publicKey: await getVapidPublicKey() });
}));

router.get('/notifications', authGuard(), asyncH(async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, req.user.id
  );
  res.json({ notifications: rows.map((n) => ({
    id: n.id, title: n.title, body: n.body, type: n.type,
    data: n.data ? JSON.parse(n.data) : null, read: !!n.read, createdAt: n.created_at,
  })) });
}));

router.post('/notifications/read', authGuard(), asyncH(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length) {
    for (const id of ids) {
      await db.run(`UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2`, id, req.user.id);
    }
  } else {
    await db.run(`UPDATE notifications SET read = 1 WHERE user_id = $1`, req.user.id);
  }
  res.json({ ok: true });
}));

router.get('/sessions', authGuard(), asyncH(async (req, res) => {
  const rows = await db.all(
    `SELECT id, device, created_at, expires_at FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    req.user.id
  );
  res.json({ sessions: rows });
}));

router.delete('/sessions/:id', authGuard(), asyncH(async (req, res) => {
  await db.run(`DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2`, req.params.id, req.user.id);
  res.json({ ok: true });
}));

router.post('/availability', authGuard(['chef', 'waiter']), asyncH(async (req, res) => {
  const available = !!req.body.available;
  await db.run(`UPDATE users SET available = $1, updated_at = $2 WHERE id = $3`, available ? 1 : 0, nowIso(), req.user.id);
  await audit('availability', available ? 'Marked self Free Now' : 'Marked self Not Available', req.user.id);
  res.json({ available });
}));

const PIN_RULES = 'Use 4–8 letters or numbers (no spaces or symbols).';
const requiredPassword = async (req) => {
  if (!verifyPassword(String(req.body.currentPassword || ''), req.user.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
};

router.post('/pin', authGuard(), asyncH(async (req, res) => {
  const pin = clean(String(req.body.pin || ''), 8);
  if (!/^[A-Za-z0-9]{4,8}$/.test(pin)) throw apiError(PIN_RULES);
  await requiredPassword(req);
  await db.run(`UPDATE users SET login_pin = $1, pin_enabled = 1, updated_at = $2 WHERE id = $3`, hashToken(pin), nowIso(), req.user.id);
  await audit('pin_set', 'Personal login PIN set', req.user.id);
  res.json({ user: serializeUser(await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id)) });
}));

router.post('/pin/clear', authGuard(), asyncH(async (req, res) => {
  await requiredPassword(req);
  await db.run(`UPDATE users SET login_pin = NULL, pin_enabled = 0, updated_at = $1 WHERE id = $2`, nowIso(), req.user.id);
  await audit('pin_cleared', 'Personal login PIN removed', req.user.id);
  res.json({ user: serializeUser(await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id)) });
}));

router.post('/email', authGuard(), asyncH(async (req, res) => {
  await requiredPassword(req);
  const email = clean(String(req.body.email || ''), 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('That email address does not look right.');
  const dupe = await db.get(`SELECT id FROM users WHERE email = $1 AND id != $2`, email, req.user.id);
  if (dupe) throw apiError('That email is already used by another account.');
  await db.run(`UPDATE users SET email = $1, updated_at = $2 WHERE id = $3`, email, nowIso(), req.user.id);
  await audit('email_changed', `Email changed to ${email}`, req.user.id);
  res.json({ user: serializeUser(await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id)) });
}));

router.post('/phone/request', authGuard(), asyncH(async (req, res) => {
  await requiredPassword(req);
  const phone = cleanPhone(req.body.newPhone);
  if (!/^\+?[0-9]{8,15}$/.test(phone)) throw apiError('Please enter a valid phone number.');
  const dupe = await db.get(`SELECT id FROM users WHERE phone = $1 AND id != $2`, phone, req.user.id);
  if (dupe) throw apiError('That phone number is already registered to another account.');
  const devCode = await generateOtp(phone, 'phone_change');
  await audit('phone_change_request', `Phone change requested to ${phone}`, req.user.id);
  res.json({ message: 'We sent a code to the new number.' + (devCode ? ` Dev code: ${devCode}` : ''), devCode });
}));

router.post('/phone/confirm', authGuard(), asyncH(async (req, res) => {
  const phone = cleanPhone(req.body.newPhone);
  const code = String(req.body.code || '').trim();
  const r = await verifyOtp(phone, 'phone_change', code);
  if (!r.ok) throw apiError(r.reason);
  await db.run(`UPDATE users SET phone = $1, updated_at = $2 WHERE id = $3`, phone, nowIso(), req.user.id);
  await audit('phone_changed', `Phone changed to ${phone}`, req.user.id);
  res.json({ user: serializeUser(await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id)) });
}));

function otpauthUri(email, secret) {
  const label = encodeURIComponent(`${email || 'user@odc.in'}`);
  return `otpauth://totp/O.D.C:${label}?secret=${encodeURIComponent(secret)}&issuer=O.D.C&algorithm=SHA1&digits=6&period=30`;
}

router.post('/totp/setup', authGuard(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  if (u.totp_secret && u.totp_enabled) throw apiError('Authenticator is already on. Disable it first to change the secret.');
  await requiredPassword(req);
  const secret = u.totp_secret || generateTotpSecret();
  await db.run(`UPDATE users SET totp_secret = $1, totp_enabled = 0, updated_at = $2 WHERE id = $3`, secret, nowIso(), u.id);
  await audit('totp_setup', 'Authenticator setup started', req.user.id);
  res.json({ secret, otpauth: otpauthUri(u.email, secret) });
}));

router.post('/totp/confirm', authGuard(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  if (!u.totp_secret) throw apiError('Start the authenticator setup first.');
  if (u.totp_enabled) throw apiError('Authenticator is already on.');
  if (!verifyTotp(u.totp_secret, String(req.body.code || '').trim())) {
    throw apiError("That code didn't match your authenticator app — try again.");
  }
  await db.run(`UPDATE users SET totp_enabled = 1, updated_at = $1 WHERE id = $2`, nowIso(), u.id);
  await audit('totp_enabled', 'Authenticator 2FA enabled', req.user.id);
  res.json({ user: serializeUser(await db.get(`SELECT * FROM users WHERE id = $1`, u.id)) });
}));

router.post('/totp/disable', authGuard(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  if (!u.totp_enabled) throw apiError('Authenticator is not on.');
  await requiredPassword(req);
  if (!verifyTotp(u.totp_secret, String(req.body.code || '').trim())) {
    throw apiError("That code didn't match your authenticator app — try again.");
  }
  await db.run(`UPDATE users SET totp_secret = NULL, totp_enabled = 0, updated_at = $1 WHERE id = $2`, nowIso(), u.id);
  await audit('totp_disabled', 'Authenticator 2FA disabled', req.user.id);
  res.json({ user: serializeUser(await db.get(`SELECT * FROM users WHERE id = $1`, u.id)) });
}));

router.post('/delete-account', authGuard(), asyncH(async (req, res) => {
  if (!verifyPassword(String(req.body.password || ''), req.user.password_hash)) {
    throw apiError('Password is not correct.');
  }
  await audit('delete_account', 'Account deleted by user', req.user.id);
  await db.run(`DELETE FROM users WHERE id = $1`, req.user.id);
  res.json({ ok: true });
}));

export default router;
