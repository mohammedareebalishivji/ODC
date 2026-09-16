import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env before anything reads process.env. Node has done this
// natively since 20.6, so no dotenv dependency is needed. The file is
// gitignored — secrets live there, never in source.
const ENV_FILE = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(ENV_FILE);
}

export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_PATH = process.env.ODC_DB_PATH || path.join(DATA_DIR, 'odc.db');
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
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/odc';
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 8);

// Optional. Only needed to fan real-time events across multiple API
// instances; a single instance is fully real-time without them.
// SUPABASE_SERVICE_KEY bypasses RLS entirely — it is a server-only secret and
// must never reach the client bundle.
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

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