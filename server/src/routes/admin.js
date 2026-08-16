import { Router } from 'express';
import crypto from 'node:crypto';
import { db, getFeeRate, audit } from '../db.js';
import { asyncH, authGuard } from '../middleware.js';
import { verifyPassword, hashPassword, serializeUser, assertStrongPassword } from '../auth.js';
import { totp, verifyTotp, signJwt, generateTotpSecret, hashToken, staticCodeFor } from '../security.js';
import { uid, nowIso, apiError, DEV } from '../config.js';
import { loginLimiter } from '../rate.js';
import { notifyUser } from '../notify.js';

const router = Router();
const ADMIN_TTL = 60 * 60 * 12;

router.post(
  '/login',
  loginLimiter((req) => (req.body && req.body.email) || req.ip),
  asyncH(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();

    const user = db.prepare(`SELECT * FROM users WHERE role = 'admin' AND (email = ? OR phone = ?)`).get(email, email);
    // Same generic error regardless of whether the admin path/account exists.
    if (!user || !user.totp_secret || !verifyPassword(password, user.password_hash)) {
      audit('admin_login_fail', `Admin login failed for ${email}`, null);
      throw apiError('That email or password did not match.');
    }
    // Accept either the permanent admin code or a live TOTP code.
    const staticOk = user.pin_enabled && hashToken(String(code).trim()) === user.login_pin;
    const totpOk = verifyTotp(user.totp_secret, code);
    if (!staticOk && !totpOk) {
      audit('admin_2fa_fail', `Admin 2FA failed for ${user.email}`, user.id);
      throw apiError('That email or password did not match.');
    }
    if (user.suspended || user.banned) throw apiError('This account is not available.');

    db.prepare(`UPDATE users SET updated_at = ? WHERE id = ?`).run(nowIso(), user.id);
    audit('admin_login', `Admin signed in (2FA passed)`, user.id);
    res.json({
      admin: serializeUser(user),
      accessToken: signJwt({ sub: user.id, role: 'admin', admin: true }, ADMIN_TTL),
    });
  })
);

router.get('/provision', asyncH((_req, res) => {
  // In production this endpoint would be disabled. Only reachable via the internal path.
  res.json({ supportEmail: 'ops@odc-internal.com' });
}));

function requireAdmin() {
  return [authGuard(['admin']), (req, res, next) => {
    if (!req.tokenPayload.admin) {
      res.status(403).json({ error: 'Admin session required.' });
      return;
    }
    next();
  }];
}

const statsQuery = () => {
  const nowIso = new Date().toISOString();
  const u = db.prepare(`SELECT COUNT(*) n FROM users`).get();
  const byRole = (r) => db.prepare(`SELECT COUNT(*) n FROM users WHERE role = ?`).get(r).n;
  const openShifts = db.prepare(`SELECT COUNT(*) n FROM shifts WHERE status='open' AND expires_at > ?`).get(nowIso).n;
  const matchedShifts = db.prepare(`SELECT COUNT(*) n FROM shifts WHERE status='matched'`).get().n;
  const expiredShifts = db.prepare(`SELECT COUNT(*) n FROM shifts WHERE status='expired'`).get().n;
  const total = Math.max(1, openShifts + expiredShifts);
  const fillRate = Math.round((matchedShifts / Math.max(1, matchedShifts + openShifts + expiredShifts)) * 100);

  const avgMatch = db.prepare(
    `SELECT AVG((julianday(matched_at) - julianday(created_at)) * 24 * 3600) avg FROM shifts WHERE matched_at IS NOT NULL`
  ).get().avg;

  const specialty = db.prepare(
    `SELECT specialty, COUNT(*) n FROM shifts WHERE role='chef' GROUP BY specialty ORDER BY n DESC LIMIT 6`
  ).all();
  const location = db.prepare(
    `SELECT COALESCE(location_name,'Unknown') loc, COUNT(*) n FROM shifts GROUP BY loc ORDER BY n DESC LIMIT 6`
  ).all();

  const feeRows = db.prepare(`SELECT * FROM fee_records ORDER BY created_at DESC LIMIT 1`).get();
  const revenue = db.prepare(`SELECT COALESCE(SUM(fee_amount),0) total FROM fee_records`).get().total;
  const settledRevenue = db.prepare(`SELECT COALESCE(SUM(fee_amount),0) total FROM fee_records WHERE settled=1`).get().total;

  return {
    users: u.n,
    roles: { manager: byRole('manager'), chef: byRole('chef'), waiter: byRole('waiter') },
    shifts: { open: openShifts, matched: matchedShifts, expired: expiredShifts },
    fillRate,
    avgTimeToMatchSec: avgMatch || null,
    mostRequestedSpecialties: specialty,
    busiestLocations: location,
    revenue: { total: Math.round(revenue * 100) / 100, settled: Math.round(settledRevenue * 100) / 100, settledCount: db.prepare(`SELECT COUNT(*) n FROM fee_records WHERE settled=1`).get().n },
    latestFee: feeRows || null,
  };
};

router.get('/stats', ...requireAdmin(), asyncH(async (_req, res) => {
  res.json({ stats: statsQuery(), feeRate: getFeeRate() });
}));

router.get('/self', ...requireAdmin(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ admin: serializeUser(u), staticCode: adminDisplayCode(u), otpauth: u.totp_secret ? otpauthUri(u.email, u.totp_secret) : null });
}));

router.patch('/self', ...requireAdmin(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if ('name' in req.body) {
    const name = String(req.body.name || '').trim().slice(0, 120);
    if (name.length < 2) throw apiError('Please enter your name.');
    db.prepare(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`).run(name, nowIso(), u.id);
    audit('admin_profile', 'Updated own name', u.id);
  }
  if ('email' in req.body) {
    if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
      throw apiError('Your current password is not correct.');
    }
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('That email address does not look right.');
    const dupe = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(email, u.id);
    if (dupe) throw apiError('That email is already used by another account.');
    db.prepare(`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`).run(email, nowIso(), u.id);
    audit('admin_profile', `Updated own email to ${email}`, u.id);
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id);
  res.json({ admin: serializeUser(row), staticCode: adminDisplayCode(row), otpauth: row.totp_secret ? otpauthUri(row.email, row.totp_secret) : null });
}));

router.post('/self/password', ...requireAdmin(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  assertStrongPassword(String(req.body.newPassword || ''));
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    hashPassword(req.body.newPassword), nowIso(), u.id
  );
  db.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).run(u.id);
  audit('admin_profile', 'Changed own password', u.id);
  res.json({ ok: true, message: 'Password changed.' });
}));

router.post('/self/totp/rotate', ...requireAdmin(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  const secret = generateTotpSecret();
  db.prepare(`UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?`).run(secret, nowIso(), u.id);
  audit('admin_profile', 'Rotated own authenticator (TOTP) secret', u.id);
  res.json({ secret, otpauth: otpauthUri(u.email, secret), code: totp(secret) });
}));

router.post('/self/code', ...requireAdmin(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  let newCode = String(req.body.code || '').trim();
  if (newCode) {
    if (!/^\d{6}$/.test(newCode)) throw apiError('Use exactly 6 digits (0–9).');
    if (hashToken(newCode) === u.login_pin) throw apiError('That is already your current code.');
  } else {
    newCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    if (hashToken(newCode) === u.login_pin) throw apiError('Generated a code you already use — try again.');
  }
  db.prepare(`UPDATE users SET static_code_override = ?, login_pin = ?, pin_enabled = 1, updated_at = ? WHERE id = ?`)
    .run(newCode, hashToken(newCode), nowIso(), u.id);
  audit('admin_profile', 'Changed own permanent sign-in code', u.id);
  res.json({ staticCode: newCode, message: `Sign-in code changed to ${newCode}. Use it next time you sign in.` });
}));

function otpauthUri(email, secret) {
  const label = encodeURIComponent(String(email || 'admin@odc-internal.com'));
  return `otpauth://totp/O.D.C:${label}?secret=${encodeURIComponent(secret)}&issuer=O.D.C&algorithm=SHA1&digits=6&period=30`;
}

function adminDisplayCode(u) {
  return u.static_code_override || staticCodeFor(u.email);
}

router.get('/users', ...requireAdmin(), asyncH(async (req, res) => {
  const role = req.query.role || null;
  const rows = role ? db.prepare(`SELECT * FROM users WHERE role = ? ORDER BY created_at DESC LIMIT 200`).all(role)
    : db.prepare(`SELECT * FROM users ORDER BY created_at DESC LIMIT 400`).all();
  res.json({ users: rows.map((u) => {
    const avg = db.prepare(`SELECT AVG(stars) avg, COUNT(*) n FROM ratings WHERE to_user = ?`).get(u.id);
    return { ...serializeUser(u), rating: { avg: avg.avg || 0, count: avg.n } };
  }) });
}));

router.patch('/users/:id', ...requireAdmin(), asyncH(async (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id = ? AND role != 'admin'`).get(req.params.id);
  if (!u) throw apiError('User not found.');
  const { action } = req.body;
  const actions = {
    verify: () => db.prepare(`UPDATE users SET verified_badge = 1, updated_at = ? WHERE id = ?`).run(nowIso(), u.id),
    unverify: () => db.prepare(`UPDATE users SET verified_badge = 0, updated_at = ? WHERE id = ?`).run(nowIso(), u.id),
    suspend: () => db.prepare(`UPDATE users SET suspended = 1, updated_at = ? WHERE id = ?`).run(nowIso(), u.id),
    unsuspend: () => db.prepare(`UPDATE users SET suspended = 0, updated_at = ? WHERE id = ?`).run(nowIso(), u.id),
    ban: () => db.prepare(`UPDATE users SET banned = 1, updated_at = ? WHERE id = ?`).run(nowIso(), u.id),
    unban: () => db.prepare(`UPDATE users SET banned = 0, updated_at = ? WHERE id = ?`).run(nowIso(), u.id),
  };
  if (!actions[action]) throw apiError('Unknown action.');
  actions[action]();
  notifyUser(u.id, 'Account update', `Your O.D.C account status changed: ${action}.`, 'account', null);
  audit('admin_user_action', `${action} on ${u.name} (${u.id})`, req.user.id);
  res.json({ ok: true });
}));

router.get('/shifts', ...requireAdmin(), asyncH(async (req, res) => {
  const status = req.query.status || null;
  const rows = status
    ? db.prepare(`SELECT * FROM shifts WHERE status = ? ORDER BY created_at DESC LIMIT 200`).all(status)
    : db.prepare(`SELECT * FROM shifts ORDER BY created_at DESC LIMIT 400`).all();
  const out = rows.map((s) => {
    const m = db.prepare(`SELECT name FROM users WHERE id = ?`).get(s.manager_id);
    const w = s.matched_worker_id ? db.prepare(`SELECT name FROM users WHERE id = ?`).get(s.matched_worker_id) : null;
    let workerName = w ? w.name : null;
    const respCount = db.prepare(`SELECT COUNT(*) n FROM responses WHERE shift_id = ?`).get(s.id).n;
    const fee = db.prepare(`SELECT * FROM fee_records WHERE shift_id = ?`).get(s.id);
    return {
      id: s.id, role: s.role, specialty: s.specialty, locationName: s.location_name,
      payMin: s.pay_min, payMax: s.pay_max, status: s.status, createdAt: s.created_at,
      expiresAt: s.expires_at, agreedPay: s.agreed_pay, matchedAt: s.matched_at,
      managerName: m ? m.name : null, workerName, respCount,
      feeRecord: fee || null, differenceMs: Math.max(0, new Date(s.expires_at).getTime() - Date.now()),
    };
  });
  res.json({ shifts: out });
}));

router.get('/ratings', ...requireAdmin(), asyncH(async (_req, res) => {
  const rows = db.prepare(
    `SELECT r.*, fu.name from_name, tu.name to_name, s.date shift_date FROM ratings r
     JOIN users fu ON fu.id = r.from_user JOIN users tu ON tu.id = r.to_user
     LEFT JOIN shifts s ON s.id = r.shift_id ORDER BY r.created_at DESC LIMIT 200`
  ).all();
  res.json({ ratings: rows });
}));

router.get('/fees', ...requireAdmin(), asyncH(async (_req, res) => {
  res.json({ feeRate: getFeeRate(), history: db.prepare(`SELECT * FROM fees ORDER BY id DESC LIMIT 50`).all() });
}));

router.put('/fees', ...requireAdmin(), asyncH(async (req, res) => {
  const rate = Number(req.body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) throw apiError('Fee rate must be between 0% and 50%.');
  db.prepare(`INSERT INTO fees (rate, label, updated_by, created_at) VALUES (?,?,?,?)`)
    .run(rate / 100, String(req.body.label || '').trim().slice(0, 80) || null, req.user.email, nowIso());
  audit('admin_fee_change', `Platform fee set to ${(rate / 100) * 100}%`, req.user.id);
  const shiftIds = db.prepare(`SELECT id FROM shifts WHERE status='matched'`).all().map((r) => r.id);
  const upd = db.prepare(`UPDATE fee_records SET fee_rate = ?, fee_amount = ?, worker_payout = ? WHERE shift_id = ?`);
  for (const id of shiftIds) {
    const fr = db.prepare(`SELECT * FROM fee_records WHERE shift_id = ?`).get(id);
    if (!fr) continue;
    const f = Math.round(fr.agreed_pay * (rate / 100) * 100) / 100;
    upd.run(rate / 100, f, Math.round((fr.agreed_pay - f) * 100) / 100, id);
  }
  res.json({ feeRate: rate / 100 });
}));

router.post('/announcements', ...requireAdmin(), asyncH(async (req, res) => {
  const message = String(req.body.message || '').trim().slice(0, 500);
  if (!message) throw apiError('Write a short message first.');
  const target = req.body.target === 'chef' || req.body.target === 'waiter' || req.body.target === 'manager' ? req.body.target : 'all';
  const id = uid('ann');
  db.prepare(`INSERT INTO announcements (id, message, target, created_by, created_at) VALUES (?,?,?,?,?)`)
    .run(id, message, target, req.user.id, nowIso());
  const who = target === 'all' ? db.prepare(`SELECT id FROM users WHERE role != 'admin'`).all()
    : db.prepare(`SELECT id FROM users WHERE role = ?`).all(target);
  for (const w of who) {
    notifyUser(w.id, 'Message from O.D.C', message, 'announcement', { announcementId: id });
  }
  audit('admin_announcement', `Broadcast to ${who.length} user(s)`, req.user.id);
  res.status(201).json({ ok: true, sentTo: who.length });
}));

router.get('/audit-logs', ...requireAdmin(), asyncH(async (_req, res) => {
  res.json({ logs: db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300`).all() });
}));

router.post('/create-admin', asyncH(async (_req, res) => {
  // Intended for internal/dev provisioning only; documented to be disabled in production.
  const email = String(process.env.ODC_ADMIN_PROVISION_EMAIL || '').toLowerCase();
  const password = String(process.env.ODC_ADMIN_PROVISION_PASSWORD || '');
  if (!email || !password || !DEV) throw apiError('Provisioning unavailable.');
  const existing = db.prepare(`SELECT * FROM users WHERE role = 'admin'`).get();
  if (existing) throw apiError('Admin already exists; delete via DB to hard-provision.');
  const id = uid('usr');
  db.prepare(
    `INSERT INTO users (id, role, name, email, password_hash, active, totp_secret, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?,?)`
  ).run(id, 'admin', 'Platform Owner', email, hashPassword(password), generateTotpSecret(), nowIso(), nowIso());
  audit('admin_created', `Admin account provisioned`, id);
  res.json({ ok: true });
}));

export default router;