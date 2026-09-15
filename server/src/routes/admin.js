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

    const user = await db.get(`SELECT * FROM users WHERE role = 'admin' AND (email = $1 OR phone = $2)`, email, email);
    if (!user || !user.totp_secret || !verifyPassword(password, user.password_hash)) {
      await audit('admin_login_fail', `Admin login failed for ${email}`, null);
      throw apiError('That email or password did not match.');
    }
    const staticOk = user.pin_enabled && hashToken(String(code).trim()) === user.login_pin;
    const totpOk = verifyTotp(user.totp_secret, code);
    if (!staticOk && !totpOk) {
      await audit('admin_2fa_fail', `Admin 2FA failed for ${user.email}`, user.id);
      throw apiError('That email or password did not match.');
    }
    if (user.suspended || user.banned) throw apiError('This account is not available.');

    await db.run(`UPDATE users SET updated_at = $1 WHERE id = $2`, nowIso(), user.id);
    await audit('admin_login', `Admin signed in (2FA passed)`, user.id);
    res.json({
      admin: serializeUser(user),
      accessToken: signJwt({ sub: user.id, role: 'admin', admin: true }, ADMIN_TTL),
    });
  })
);

router.get('/provision', asyncH(async (_req, res) => {
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

const statsQuery = async () => {
  const nowIso = new Date().toISOString();
  const u = await db.get(`SELECT COUNT(*)::int n FROM users`);
  const byRole = async (r) => (await db.get(`SELECT COUNT(*)::int n FROM users WHERE role = $1`, r)).n;
  const openShifts = (await db.get(`SELECT COUNT(*)::int n FROM shifts WHERE status='open' AND expires_at > $1`, nowIso)).n;
  const matchedShifts = (await db.get(`SELECT COUNT(*)::int n FROM shifts WHERE status='matched'`)).n;
  const expiredShifts = (await db.get(`SELECT COUNT(*)::int n FROM shifts WHERE status='expired'`)).n;
  const fillRate = Math.round((matchedShifts / Math.max(1, matchedShifts + openShifts + expiredShifts)) * 100);

  const avgMatch = (await db.get(
    `SELECT AVG(EXTRACT(EPOCH FROM (matched_at::timestamp - created_at::timestamp)))::float avg FROM shifts WHERE matched_at IS NOT NULL`
  )).avg;

  const specialty = await db.all(
    `SELECT specialty, COUNT(*)::int n FROM shifts WHERE role='chef' GROUP BY specialty ORDER BY n DESC LIMIT 6`
  );
  const location = await db.all(
    `SELECT COALESCE(location_name,'Unknown') loc, COUNT(*)::int n FROM shifts GROUP BY loc ORDER BY n DESC LIMIT 6`
  );

  const feeRows = await db.get(`SELECT * FROM fees ORDER BY id DESC LIMIT 1`);
  const revenue = (await db.get(`SELECT COALESCE(SUM(fee_amount),0)::float total FROM fee_records`)).total;
  const settledRevenue = (await db.get(`SELECT COALESCE(SUM(fee_amount),0)::float total FROM fee_records WHERE settled=1`)).total;

  return {
    users: u.n,
    roles: { manager: await byRole('manager'), chef: await byRole('chef'), waiter: await byRole('waiter') },
    shifts: { open: openShifts, matched: matchedShifts, expired: expiredShifts },
    fillRate,
    avgTimeToMatchSec: avgMatch || null,
    mostRequestedSpecialties: specialty,
    busiestLocations: location,
    revenue: { total: Math.round(revenue * 100) / 100, settled: Math.round(settledRevenue * 100) / 100, settledCount: (await db.get(`SELECT COUNT(*)::int n FROM fee_records WHERE settled=1`)).n },
    latestFee: feeRows || null,
  };
};

/**
 * Treasury terminal. Totals are summed from the escrow ledger rather than
 * cached, so the terminal always reconciles against escrow_holds.
 */
router.get('/treasury', ...requireAdmin(), asyncH(async (_req, res) => {
  const agg = await db.all(
    `SELECT status,
            COUNT(*)::int              AS n,
            COALESCE(SUM(worker_amount), 0) AS worker_total,
            COALESCE(SUM(fee_amount), 0)    AS fee_total
       FROM escrow_holds
      GROUP BY status`
  );

  const by = Object.fromEntries(agg.map((r) => [r.status, r]));
  const totals = {
    held: Number(by.held?.worker_total ?? 0),
    heldCount: by.held?.n ?? 0,
    disputed: Number(by.disputed?.worker_total ?? 0),
    disputedCount: by.disputed?.n ?? 0,
    released: Number(by.released?.worker_total ?? 0),
    releasedCount: by.released?.n ?? 0,
    // Fees are only actually earned once the hold settles to the worker.
    fees: Number(by.released?.fee_total ?? 0),
    feesCount: by.released?.n ?? 0,
  };

  const rows = await db.all(
    `SELECT h.*, s.location_name, w.name AS worker_name
       FROM escrow_holds h
       LEFT JOIN shifts s ON s.id = h.shift_id
       LEFT JOIN users  w ON w.id = h.worker_id
      ORDER BY h.created_at DESC
      LIMIT 200`
  );

  res.json({
    totals,
    holds: rows.map((h) => ({
      id: h.id,
      venue: h.location_name,
      worker: h.worker_name,
      grossAmount: h.gross_amount,
      feeAmount: h.fee_amount,
      workerAmount: h.worker_amount,
      status: h.status,
      createdAt: h.created_at,
    })),
  });
}));

router.get('/stats', ...requireAdmin(), asyncH(async (_req, res) => {
  res.json({ stats: await statsQuery(), feeRate: await getFeeRate() });
}));

router.get('/self', ...requireAdmin(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  res.json({ admin: serializeUser(u), staticCode: adminDisplayCode(u), otpauth: u.totp_secret ? otpauthUri(u.email, u.totp_secret) : null });
}));

router.patch('/self', ...requireAdmin(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  if ('name' in req.body) {
    const name = String(req.body.name || '').trim().slice(0, 120);
    if (name.length < 2) throw apiError('Please enter your name.');
    await db.run(`UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`, name, nowIso(), u.id);
    await audit('admin_profile', 'Updated own name', u.id);
  }
  if ('email' in req.body) {
    if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
      throw apiError('Your current password is not correct.');
    }
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('That email address does not look right.');
    const dupe = await db.get(`SELECT id FROM users WHERE email = $1 AND id != $2`, email, u.id);
    if (dupe) throw apiError('That email is already used by another account.');
    await db.run(`UPDATE users SET email = $1, updated_at = $2 WHERE id = $3`, email, nowIso(), u.id);
    await audit('admin_profile', `Updated own email to ${email}`, u.id);
  }
  const row = await db.get(`SELECT * FROM users WHERE id = $1`, u.id);
  res.json({ admin: serializeUser(row), staticCode: adminDisplayCode(row), otpauth: row.totp_secret ? otpauthUri(row.email, row.totp_secret) : null });
}));

router.post('/self/password', ...requireAdmin(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  assertStrongPassword(String(req.body.newPassword || ''));
  await db.run(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
    hashPassword(req.body.newPassword), nowIso(), u.id
  );
  await db.run(`DELETE FROM refresh_tokens WHERE user_id = $1`, u.id);
  await audit('admin_profile', 'Changed own password', u.id);
  res.json({ ok: true, message: 'Password changed.' });
}));

router.post('/self/totp/rotate', ...requireAdmin(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
  if (!verifyPassword(String(req.body.currentPassword || ''), u.password_hash)) {
    throw apiError('Your current password is not correct.');
  }
  const secret = generateTotpSecret();
  await db.run(`UPDATE users SET totp_secret = $1, updated_at = $2 WHERE id = $3`, secret, nowIso(), u.id);
  await audit('admin_profile', 'Rotated own authenticator (TOTP) secret', u.id);
  res.json({ secret, otpauth: otpauthUri(u.email, secret), code: totp(secret) });
}));

router.post('/self/code', ...requireAdmin(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1`, req.user.id);
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
  await db.run(`UPDATE users SET static_code_override = $1, login_pin = $2, pin_enabled = 1, updated_at = $3 WHERE id = $4`,
    newCode, hashToken(newCode), nowIso(), u.id
  );
  await audit('admin_profile', 'Changed own permanent sign-in code', u.id);
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
  const rows = role
    ? await db.all(`SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT 200`, role)
    : await db.all(`SELECT * FROM users ORDER BY created_at DESC LIMIT 400`);
  res.json({ users: await Promise.all(rows.map(async (u) => {
    const avg = await db.get(`SELECT AVG(stars)::float avg, COUNT(*)::int n FROM ratings WHERE to_user = $1`, u.id);
    return { ...serializeUser(u), rating: { avg: avg.avg || 0, count: avg.n } };
  })) });
}));

router.patch('/users/:id', ...requireAdmin(), asyncH(async (req, res) => {
  const u = await db.get(`SELECT * FROM users WHERE id = $1 AND role != 'admin'`, req.params.id);
  if (!u) throw apiError('User not found.');
  const { action } = req.body;
  const actions = {
    verify: () => db.run(`UPDATE users SET verified_badge = 1, updated_at = $1 WHERE id = $2`, nowIso(), u.id),
    unverify: () => db.run(`UPDATE users SET verified_badge = 0, updated_at = $1 WHERE id = $2`, nowIso(), u.id),
    suspend: () => db.run(`UPDATE users SET suspended = 1, updated_at = $1 WHERE id = $2`, nowIso(), u.id),
    unsuspend: () => db.run(`UPDATE users SET suspended = 0, updated_at = $1 WHERE id = $2`, nowIso(), u.id),
    ban: () => db.run(`UPDATE users SET banned = 1, updated_at = $1 WHERE id = $2`, nowIso(), u.id),
    unban: () => db.run(`UPDATE users SET banned = 0, updated_at = $1 WHERE id = $2`, nowIso(), u.id),
  };
  if (!actions[action]) throw apiError('Unknown action.');
  await actions[action]();
  await notifyUser(u.id, 'notif.accountUpdate.title', 'notif.accountUpdate.body', 'account', { action });
  await audit('admin_user_action', `${action} on ${u.name} (${u.id})`, req.user.id);
  res.json({ ok: true });
}));

router.get('/shifts', ...requireAdmin(), asyncH(async (req, res) => {
  const status = req.query.status || null;
  const rows = status
    ? await db.all(`SELECT * FROM shifts WHERE status = $1 ORDER BY created_at DESC LIMIT 200`, status)
    : await db.all(`SELECT * FROM shifts ORDER BY created_at DESC LIMIT 400`);
  const out = await Promise.all(rows.map(async (s) => {
    const m = await db.get(`SELECT name FROM users WHERE id = $1`, s.manager_id);
    const w = s.matched_worker_id ? await db.get(`SELECT name FROM users WHERE id = $1`, s.matched_worker_id) : null;
    let workerName = w ? w.name : null;
    const respCount = (await db.get(`SELECT COUNT(*)::int n FROM responses WHERE shift_id = $1`, s.id)).n;
    const fee = await db.get(`SELECT * FROM fee_records WHERE shift_id = $1`, s.id);
    return {
      id: s.id, role: s.role, specialty: s.specialty, locationName: s.location_name,
      payMin: s.pay_min, payMax: s.pay_max, status: s.status, createdAt: s.created_at,
      expiresAt: s.expires_at, agreedPay: s.agreed_pay, matchedAt: s.matched_at,
      managerName: m ? m.name : null, workerName, respCount,
      feeRecord: fee || null, differenceMs: Math.max(0, new Date(s.expires_at).getTime() - Date.now()),
    };
  }));
  res.json({ shifts: out });
}));

router.get('/ratings', ...requireAdmin(), asyncH(async (_req, res) => {
  const rows = await db.all(
    `SELECT r.*, fu.name from_name, tu.name to_name, s.date shift_date FROM ratings r
     JOIN users fu ON fu.id = r.from_user JOIN users tu ON tu.id = r.to_user
     LEFT JOIN shifts s ON s.id = r.shift_id ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({ ratings: rows });
}));

router.get('/fees', ...requireAdmin(), asyncH(async (_req, res) => {
  res.json({ feeRate: await getFeeRate(), history: await db.all(`SELECT * FROM fees ORDER BY id DESC LIMIT 50`) });
}));

router.put('/fees', ...requireAdmin(), asyncH(async (req, res) => {
  const rate = Number(req.body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) throw apiError('Fee rate must be between 0% and 50%.');
  await db.run(`INSERT INTO fees (rate, label, updated_by, created_at) VALUES ($1,$2,$3,$4)`,
    rate / 100, String(req.body.label || '').trim().slice(0, 80) || null, req.user.email, nowIso()
  );
  await audit('admin_fee_change', `Platform fee set to ${(rate / 100) * 100}%`, req.user.id);
  const shiftIds = (await db.all(`SELECT id FROM shifts WHERE status='matched'`)).map((r) => r.id);
  for (const id of shiftIds) {
    const fr = await db.get(`SELECT * FROM fee_records WHERE shift_id = $1`, id);
    if (!fr) continue;
    const f = Math.round(fr.agreed_pay * (rate / 100) * 100) / 100;
    await db.run(`UPDATE fee_records SET fee_rate = $1, fee_amount = $2, worker_payout = $3 WHERE shift_id = $4`,
      rate / 100, f, Math.round((fr.agreed_pay - f) * 100) / 100, id
    );
  }
  res.json({ feeRate: rate / 100 });
}));

router.post('/announcements', ...requireAdmin(), asyncH(async (req, res) => {
  const message = String(req.body.message || '').trim().slice(0, 500);
  if (!message) throw apiError('Write a short message first.');
  const target = req.body.target === 'chef' || req.body.target === 'waiter' || req.body.target === 'manager' ? req.body.target : 'all';
  const id = uid('ann');
  await db.run(`INSERT INTO announcements (id, message, target, created_by, created_at) VALUES ($1,$2,$3,$4,$5)`,
    id, message, target, req.user.id, nowIso()
  );
  const who = target === 'all'
    ? await db.all(`SELECT id FROM users WHERE role != 'admin'`)
    : await db.all(`SELECT id FROM users WHERE role = $1`, target);
  for (const w of who) {
    await notifyUser(w.id, 'notif.announcement.title', message, 'announcement', { announcementId: id });
  }
  await audit('admin_announcement', `Broadcast to ${who.length} user(s)`, req.user.id);
  res.status(201).json({ ok: true, sentTo: who.length });
}));

router.get('/audit-logs', ...requireAdmin(), asyncH(async (_req, res) => {
  res.json({ logs: await db.all(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300`) });
}));

router.post('/create-admin', asyncH(async (_req, res) => {
  const email = String(process.env.ODC_ADMIN_PROVISION_EMAIL || '').toLowerCase();
  const password = String(process.env.ODC_ADMIN_PROVISION_PASSWORD || '');
  if (!email || !password || !DEV) throw apiError('Provisioning unavailable.');
  const existing = await db.get(`SELECT * FROM users WHERE role = 'admin'`);
  if (existing) throw apiError('Admin already exists; delete via DB to hard-provision.');
  const id = uid('usr');
  await db.run(
    `INSERT INTO users (id, role, name, email, password_hash, active, totp_secret, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8)`,
    id, 'admin', 'Platform Owner', email, hashPassword(password), generateTotpSecret(), nowIso(), nowIso()
  );
  await audit('admin_created', `Admin account provisioned`, id);
  res.json({ ok: true });
}));

export default router;
