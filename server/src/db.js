import pg from 'pg';
import { DATABASE_URL } from './config.js';

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

export const db = {
  async run(sql, ...params) {
    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return { changes: result.rowCount, lastID: result.rows[0]?.id ?? null };
    } finally {
      client.release();
    }
  },

  async get(sql, ...params) {
    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows[0] ?? undefined;
    } finally {
      client.release();
    }
  },

  async all(sql, ...params) {
    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  async exec(sql) {
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  },

  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
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
        login_pin   TEXT,
        pin_enabled INTEGER NOT NULL DEFAULT 0,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        static_code_override TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS manager_profiles (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        business_name TEXT,
        business_type TEXT,
        business_address TEXT,
        license_file  TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chef_profiles (
        user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        specialties    TEXT NOT NULL DEFAULT '[]',
        years_experience INTEGER DEFAULT 0,
        cert_file      TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS waiter_profiles (
        user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        experience_level TEXT,
        languages        TEXT NOT NULL DEFAULT '[]',
        id_file          TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id         TEXT PRIMARY KEY,
        phone      TEXT NOT NULL,
        purpose    TEXT NOT NULL,
        code_hash  TEXT NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        device     TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT,
        subscription TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id         TEXT PRIMARY KEY,
        shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        worker_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL CHECK (kind IN ('accept','counter')),
        amount     REAL,
        status     TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS fees (
        id         SERIAL PRIMARY KEY,
        rate       REAL NOT NULL,
        label      TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_records (
        shift_id     TEXT PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
        agreed_pay   REAL NOT NULL,
        fee_rate     REAL NOT NULL,
        fee_amount   REAL NOT NULL,
        worker_payout REAL NOT NULL,
        settled      INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id         TEXT PRIMARY KEY,
        shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        from_user  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
        comment    TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(shift_id, from_user, to_user)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL,
        type       TEXT,
        data       TEXT,
        read       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id         TEXT PRIMARY KEY,
        message    TEXT NOT NULL,
        target     TEXT NOT NULL DEFAULT 'all',
        created_by TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id         SERIAL PRIMARY KEY,
        user_id    TEXT,
        action     TEXT NOT NULL,
        detail     TEXT,
        ip         TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_shifts_status_exp ON shifts(status, expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_responses_shift ON responses(shift_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)');

    await client.query('COMMIT');
    console.log('[db] PostgreSQL schema initialized.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureColumn(table, column, type) {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
    )`,
    [table, column]
  );
  if (!result.rows[0].exists) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`[db] Added column ${table}.${column}`);
  }
}

export async function audit(action, detail, userId = null, ip = null) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, detail, ip, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [userId, action, detail, ip, new Date().toISOString()]
  );
}

export async function getFeeRate() {
  const row = await pool.query(`SELECT rate FROM fees ORDER BY id DESC LIMIT 1`);
  return row.rows[0] ? row.rows[0].rate : 0.1;
}

export { pool };
