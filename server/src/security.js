import crypto from 'node:crypto';
import { JWT_SECRET } from './config.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const b64urlJson = (obj) => b64url(Buffer.from(JSON.stringify(obj)));

function hmac(data) {
  return b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
}

export function signJwt(payload, ttlSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`;
  return `${data}.${hmac(data)}`;
}

export function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  if (hmac(data) !== parts[2]) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function totp(secret, windowSeconds = 30) {
  const steps = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = Buffer.from(secret, 'utf8');
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(steps));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

export function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(code || '')) return false;
  for (let w = -1; w <= 1; w++) {
    const candidate = totpForWindow(secret, w);
    if (candidate === code) return true;
  }
  return false;
}

function totpForWindow(secret, windowOffset, windowSeconds = 30) {
  const steps = Math.floor(Date.now() / 1000 / windowSeconds) + windowOffset;
  const key = Buffer.from(secret, 'utf8');
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(steps));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function generateTotpSecret() {
  return crypto.randomBytes(20).toString('base64');
}