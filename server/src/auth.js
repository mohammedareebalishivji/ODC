import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { uid, nowIso, DEV } from './config.js';
import { signJwt, hashToken, randomToken } from './security.js';

export const ACCESS_TTL = 60 * 60 * 2;
export const REFRESH_TTL = 60 * 60 * 24 * 30;

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 12);
}

export function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

export function passwordStrength(pw) {
  let score = 0;
  if (!pw) return 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

export const PASSWORD_RULES = 'At least 8 characters, with upper and lower case letters, a number, and a symbol.';

function pick(pw) {
  return passwordStrength(pw) >= 4;
}

export function assertStrongPassword(pw) {
  if (!pick(pw)) {
    const e = new Error(PASSWORD_RULES);
    e.status = 400;
    throw e;
  }
}

export function issueTokens(userId, role, device = 'web') {
  const refresh = randomToken();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, device, expires_at, created_at)
     VALUES (?,?,?,?,?,?)`
  ).run(
    uid('rt'),
    userId,
    hashToken(refresh),
    device,
    new Date(Date.now() + REFRESH_TTL * 1000).toISOString(),
    nowIso()
  );
  return {
    accessToken: signJwt({ sub: userId, role }, ACCESS_TTL),
    refreshToken: refresh,
  };
}

export function rotateRefresh(refresh, device) {
  const row = db.prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`).get(hashToken(refresh));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db.prepare(`DELETE FROM refresh_tokens WHERE id = ?`).run(row.id);
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(row.user_id);
  if (!user) return null;
  return issueTokens(user.id, user.role, device || row.device || 'web');
}

export function invalidateAllSessions(userId) {
  db.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).run(userId);
}

export function generateOtp(phone, purpose, ttlSec = 600) {
  db.prepare(`DELETE FROM otps WHERE phone = ? AND purpose = ?`).run(phone, purpose);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expires = new Date(Date.now() + ttlSec * 1000).toISOString();
  db.prepare(
    `INSERT INTO otps (id, phone, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)`
  ).run(uid('otp'), phone, purpose, hashToken(code), expires, nowIso());
  return DEV ? code : null;
}

export function verifyOtp(phone, purpose, code) {
  const otp = db
    .prepare(`SELECT * FROM otps WHERE phone = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`)
    .get(phone, purpose);
  if (!otp) return { ok: false, reason: 'No code was sent. Request a new one.' };
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM otps WHERE id = ?`).run(otp.id);
    return { ok: false, reason: 'That code has expired. Request a new one.' };
  }
  if (otp.attempts >= 5) {
    db.prepare(`DELETE FROM otps WHERE id = ?`).run(otp.id);
    return { ok: false, reason: 'Too many wrong attempts. Request a new code.' };
  }
  if (hashToken(code) !== otp.code_hash) {
    db.prepare(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`).run(otp.id);
    return { ok: false, reason: "That code didn't match — try again." };
  }
  db.prepare(`DELETE FROM otps WHERE id = ?`).run(otp.id);
  return { ok: true };
}

export function serializeUser(u) {
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone,
    active: !!u.active,
    suspended: !!u.suspended,
    banned: !!u.banned,
    verifiedBadge: !!u.verified_badge,
    photo: u.photo_data,
    available: !!u.available,
    pinEnabled: !!u.pin_enabled,
    totpEnabled: u.role === 'admin' ? !!u.totp_secret : !!u.totp_enabled,
    createdAt: u.created_at,
  };
}