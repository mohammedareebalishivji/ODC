import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_PATH = path.join(DATA_DIR, 'odc.db');
export const DEV = process.env.NODE_ENV !== 'production';

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadOrCreateSecret(file, fallbackLen = 48) {
  const p = path.join(DATA_DIR, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const secret = crypto.randomBytes(fallbackLen).toString('hex');
  fs.writeFileSync(p, secret, { mode: 0o600 });
  return secret;
}

export const JWT_SECRET = process.env.ODC_JWT_SECRET || loadOrCreateSecret('jwt.secret');
export const PORT = Number(process.env.PORT || 4000);

export function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function apiError(message, code = 400) {
  const e = new Error(message);
  e.status = code;
  return e;
}