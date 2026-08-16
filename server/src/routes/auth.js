import { Router } from 'express';
import { db, audit } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  assertStrongPassword,
  generateOtp,
  verifyOtp,
  issueTokens,
  rotateRefresh,
  invalidateAllSessions,
  serializeUser,
} from '../auth.js';
import { uid, nowIso, DEV, apiError } from '../config.js';
import { asyncH, authGuard } from '../middleware.js';
import { loginLimiter } from '../rate.js';
import { hashToken, verifyTotp } from '../security.js';

const router = Router();

const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanPhone = (v) => String(v || '').replace(/[^0-9+]/g, '').slice(0, 16);
const isPhone = (p) => /^\+?[0-9]{8,15}$/.test(p);

router.post(
  '/signup',
  loginLimiter((req) => (req.body && req.body.phone) || req.ip),
  asyncH(async (req, res) => {
    const { role } = req.body;
    const name = clean(req.body.name);
    const email = clean(req.body.email, 254).toLowerCase();
    const phone = cleanPhone(req.body.phone);
    const password = String(req.body.password || '');

    if (!['manager', 'chef', 'waiter'].includes(role)) throw apiError('Please choose a role.');
    if (!name || name.length < 2) throw apiError('Please enter your name.');
    if (!isPhone(phone)) throw apiError('Please enter a valid phone number.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('That email address does not look right.');
    assertStrongPassword(password);

    const dupePhone = db.prepare(`SELECT id FROM users WHERE phone = ?`).get(phone);
    if (dupePhone) throw apiError('That phone number is already registered. Log in instead.');

    const userId = uid('usr');
    db.prepare(
      `INSERT INTO users (id, role, name, email, phone, password_hash, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,0,?,?)`
    ).run(userId, role, name, email || null, phone, hashPassword(password), nowIso(), nowIso());

    if (role === 'manager') {
      db.prepare(
        `INSERT INTO manager_profiles (user_id, business_name, business_type, business_address, license_file) VALUES (?,?,?,?,?)`
      ).run(userId, clean(req.body.businessName), clean(req.body.businessType), clean(req.body.businessAddress), clean(req.body.licenseFile));
    }
    if (role === 'chef') {
      const specials = Array.isArray(req.body.specialties) ? req.body.specialties.slice(0, 12).map(clean) : [];
      db.prepare(
        `INSERT INTO chef_profiles (user_id, specialties, years_experience, cert_file) VALUES (?,?,?,?)`
      ).run(userId, JSON.stringify(specials), Number(req.body.yearsExperience) || 0, clean(req.body.certFile));
    }
    if (role === 'waiter') {
      const langs = Array.isArray(req.body.languages) ? req.body.languages.slice(0, 8).map(clean) : [];
      db.prepare(
        `INSERT INTO waiter_profiles (user_id, experience_level, languages, id_file) VALUES (?,?,?,?)`
      ).run(userId, clean(req.body.experienceLevel), JSON.stringify(langs), clean(req.body.idFile));
    }

    const devCode = generateOtp(phone, 'signup');
    audit('signup', `New ${role} account created: ${phone}`, userId);
    res.status(201).json({ userId, needsVerify: true, devCode });
  })
);

router.post('/signup-resend', loginLimiter((req) => (req.body && req.body.phone) || req.ip), asyncH(async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  const user = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone);
  if (!user || user.active) {
    throw apiError('That account is already active. Log in.');
  }
  const devCode = generateOtp(phone, 'signup');
  res.json({ message: 'A new code was sent.', devCode });
}));

router.post('/verify', loginLimiter((req) => (req.body && req.body.phone) || req.ip), asyncH(async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  const result = verifyOtp(phone, 'signup', code);
  if (!result.ok) throw apiError(result.reason);
  const user = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone);
  if (!user) throw apiError('No account found for that phone number.');
  if (user.active) throw apiError('This account is already active. Log in.');
  db.prepare(`UPDATE users SET active = 1, updated_at = ? WHERE id = ?`).run(nowIso(), user.id);
  const fresh = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone);
  const tokens = issueTokens(fresh.id, fresh.role);
  audit('otp_verified', `Phone verified via OTP`, fresh.id);
  res.json({ user: serializeUser(fresh), ...tokens });
}));

router.post('/login', loginLimiter((req) => (req.body && (req.body.identifier || req.body.phone)) || req.ip), asyncH(async (req, res) => {
  const identifier = clean(req.body.identifier, 254).toLowerCase();
  const phone = cleanPhone(req.body.identifier || req.body.phone);
  const password = String(req.body.password || '');
  const device = clean(req.body.device, 40) || 'web';

  const user = identifier
    ? db.prepare(`SELECT * FROM users WHERE email = ? OR phone = ?`).get(identifier, phone)
    : null;
  if (!user || !verifyPassword(password, user.password_hash)) {
    audit('failed_login', `Login failed for ${identifier || phone}`, null);
    throw apiError('That phone/email or password did not match.');
  }
  if (!user.active) throw apiError('This account is not active yet. Verify your phone code first.');
  if (user.banned) throw apiError('This account has been banned.');
  if (user.suspended) throw apiError('This account is temporarily suspended.');

  const pin = String(req.body.pin || '');
  const code = String(req.body.code || '').trim();
  const pinOn = !!user.pin_enabled && !!user.login_pin;
  const totpOn = user.totp_secret && (user.role === 'admin' ? !user.suspended : !!user.totp_enabled);
  const needs2fa = pinOn || totpOn;

  if (needs2fa && !pin && !code) {
    // Ask the client for their second factor — never leak which one is set.
    return res.json({ step: 'challenge', user: serializeUser(user) });
  }

  if (needs2fa) {
    const pinOk = pinOn && hashToken(pin) === user.login_pin;
    const totpOk = totpOn && verifyTotp(user.totp_secret, code);
    if (!pinOk && !totpOk) {
      audit('login_2fa_fail', `Second-factor check failed for ${identifier}`, user.id);
      throw apiError('That code did not match. Enter your PIN or authenticator code.');
    }
  }

  const tokens = issueTokens(user.id, user.role, device);
  audit('login', `Logged in`, user.id);
  res.json({ user: serializeUser(user), ...tokens });
}));

router.post('/refresh', asyncH(async (req, res) => {
  const refresh = String(req.body.refreshToken || '');
  if (!refresh) throw apiError('Missing refresh token.');
  const result = rotateRefresh(refresh);
  if (!result) throw apiError('Session expired. Please log in again.');
  res.json(result);
}));

router.post('/logout', authGuard(), asyncH(async (req, res) => {
  const refresh = String(req.body.refreshToken || '');
  if (refresh) db.prepare(`DELETE FROM refresh_tokens WHERE token_hash = ?`).run(hashToken(refresh));
  res.json({ ok: true });
}));

router.post('/forgot-password', loginLimiter((req) => (req.body && req.body.phone) || req.ip), asyncH(async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  if (!isPhone(phone)) throw apiError('Please enter a valid phone number.');
  const user = db.prepare(`SELECT id FROM users WHERE phone = ?`).get(phone);
  if (user) {
    generateOtp(phone, 'reset');
    audit('password_reset_request', `Password reset OTP requested for ${phone}`, user.id);
  }
  res.json({ message: 'If this account exists, an OTP code has been sent to your phone.' });
}));

router.post('/reset-password', loginLimiter((req) => (req.body && req.body.phone) || req.ip), asyncH(async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  const password = String(req.body.newPassword || '');
  const result = verifyOtp(phone, 'reset', code);
  if (!result.ok) throw apiError(result.reason);
  assertStrongPassword(password);
  const user = db.prepare(`SELECT id FROM users WHERE phone = ?`).get(phone);
  if (!user) throw apiError('No account found for that phone number.');
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    hashPassword(password), nowIso(), user.id
  );
  invalidateAllSessions(user.id);
  audit('password_reset', `Password reset via OTP`, user.id);
  res.json({ message: 'Password updated. You can log in now.' });
}));

export default router;