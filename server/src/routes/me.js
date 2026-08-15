import { Router } from 'express';
import { db, audit } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { nowIso, uid, apiError, DEV } from '../config.js';
import { hashToken, randomToken } from '../security.js';
import { getVapidPublicKey, configurePush } from '../notify.js';
import { hashPassword, assertStrongPassword, serializeUser } from '../auth.js';

const router = Router();

const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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