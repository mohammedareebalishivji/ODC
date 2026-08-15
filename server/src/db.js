import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DB_PATH, DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('manager','chef','waiter','admin')),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  phone       TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 0,
  suspended   INTEGER NOT NULL DEFAULT 0,
  banned      INTEGER NOT NULL DEFAULT 0,
  verified_badge INTEGER NOT NULL DEFAULT 0,
  photo_data  TEXT,
  available   INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manager_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT,
  business_type TEXT,
  business_address TEXT,
  license_file  TEXT
);

CREATE TABLE IF NOT EXISTS chef_profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialties    TEXT NOT NULL DEFAULT '[]',
  years_experience INTEGER DEFAULT 0,
  cert_file      TEXT
);

CREATE TABLE IF NOT EXISTS waiter_profiles (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  experience_level TEXT,
  languages        TEXT NOT NULL DEFAULT '[]',
  id_file          TEXT
);

CREATE TABLE IF NOT EXISTS otps (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device     TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT,
  subscription TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id         TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('chef','waiter')),
  specialty  TEXT,
  date       TEXT NOT NULL,
  start_min  INTEGER NOT NULL,
  end_min    INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  lat        REAL,
  lng        REAL,
  pay_min    REAL NOT NULL,
  pay_max    REAL NOT NULL,
  notes      TEXT,
  dress_code TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  matched_at TEXT,
  matched_worker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  agreed_pay REAL,
  warned_soon INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS responses (
  id         TEXT PRIMARY KEY,
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  worker_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('accept','counter')),
  amount     REAL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fees (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rate       REAL NOT NULL,
  label      TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_records (
  shift_id     TEXT PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  agreed_pay   REAL NOT NULL,
  fee_rate     REAL NOT NULL,
  fee_amount   REAL NOT NULL,
  worker_payout REAL NOT NULL,
  settled      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  id         TEXT PRIMARY KEY,
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  from_user  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(shift_id, from_user, to_user)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT,
  data       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY,
  message    TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT 'all',
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_shifts_status_exp ON shifts(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_responses_shift ON responses(shift_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
`);

export function audit(action, detail, userId = null, ip = null) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, detail, ip, created_at) VALUES (?,?,?,?,?)`
  ).run(userId, action, detail, ip, new Date().toISOString());
}

export function getFeeRate() {
  const row = db.prepare(`SELECT rate FROM fees ORDER BY id DESC LIMIT 1`).get();
  return row ? row.rate : 0.1;
}