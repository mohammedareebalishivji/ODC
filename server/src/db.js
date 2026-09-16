import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DATABASE_URL, DB_POOL_MAX } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * TLS for hosted Postgres (Supabase).
 *
 * Supabase signs its certificates with its own "Supabase Root 2021 CA", so the
 * system trust store rejects them. The fix is to pin that CA — NOT to set
 * rejectUnauthorized:false, which would silently accept any certificate and
 * give up protection against man-in-the-middle on the database connection.
 *
 * A local Postgres has no TLS, so SSL is skipped for loopback hosts.
 */
function sslConfig(connectionString) {
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    /* non-URL DSNs fall through to the local-host check below */
  }
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocal || process.env.DATABASE_SSL === 'disable') return false;

  const caPath = process.env.DATABASE_CA_PATH
    || path.join(__dirname, '..', 'certs', 'supabase-ca.crt');
  if (!fs.existsSync(caPath)) {
    throw new Error(
      `Refusing to connect to ${host} without a CA certificate. `
      + `Expected one at ${caPath} — download it from the Supabase dashboard `
      + `(Database Settings → SSL Configuration), or set DATABASE_CA_PATH.`
    );
  }
  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(DATABASE_URL),
  // Supabase's shared transaction pooler allocates a modest number of server
  // connections per project, so keep the client pool well under that.
  max: DB_POOL_MAX,
  // Recycle idle connections before the pooler drops them. Supavisor closes
  // idle server connections on its own schedule; a client that only finds out
  // when it next issues a query surfaces as "Connection terminated
  // unexpectedly" mid-request.
  idleTimeoutMillis: 10000,
  // A hosted database is a network hop away; 5s is too tight for a cold start.
  connectionTimeoutMillis: 15000,
  // Keep the TCP connection warm so NAT/Wi-Fi idle timeouts don't silently
  // black-hole a socket that both ends still believe is open.
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});


/**
 * Run a query on a pooled client.
 *
 * Releasing with the error (`release(err)`) destroys the connection instead of
 * returning it to the pool. A bare release() hands a half-dead socket back for
 * the next caller to trip over, which is how one dropped connection turns into
 * a run of failures.
 */
async function withClient(fn) {
  const client = await pool.connect();
  try {
    const result = await fn(client);
    client.release();
    return result;
  } catch (err) {
    client.release(err);
    throw err;
  }
}

export const db = {
  async run(sql, ...params) {
    return withClient(async (client) => {
      const result = await client.query(sql, params);
      return { changes: result.rowCount, lastID: result.rows[0]?.id ?? null };
    });
  },

  async get(sql, ...params) {
    return withClient(async (client) => {
      const result = await client.query(sql, params);
      return result.rows[0] ?? undefined;
    });
  },

  async all(sql, ...params) {
    return withClient(async (client) => {
      const result = await client.query(sql, params);
      return result.rows;
    });
  },

  async exec(sql) {
    return withClient((client) => client.query(sql));
  },

  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      client.release();
      return result;
    } catch (err) {
      // If the connection itself died, ROLLBACK will throw too — don't let
      // that mask the original error.
      try { await client.query('ROLLBACK'); } catch { /* connection is gone */ }
      client.release(err);
      throw err;
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

    /* ------------------------------------------------------------------
       Escrow ledger.

       Money is modelled as an append-only ledger rather than a mutable
       balance column: every movement is a row, and a wallet balance is the
       sum of its entries. That makes the treasury console auditable and
       means a bug can never silently "lose" a rupee.
    ------------------------------------------------------------------ */
    await client.query(`
      CREATE TABLE IF NOT EXISTS escrow_holds (
        id          TEXT PRIMARY KEY,
        shift_id    TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        manager_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        worker_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
        gross_amount  REAL NOT NULL,
        fee_amount    REAL NOT NULL,
        worker_amount REAL NOT NULL,
        status      TEXT NOT NULL DEFAULT 'held'
                    CHECK (status IN ('held','released','refunded','disputed')),
        created_at  TEXT NOT NULL,
        released_at TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        hold_id    TEXT REFERENCES escrow_holds(id) ON DELETE SET NULL,
        shift_id   TEXT REFERENCES shifts(id) ON DELETE SET NULL,
        kind       TEXT NOT NULL
                   CHECK (kind IN ('earning','payout','fee','refund','adjustment')),
        -- Positive credits the user, negative debits them.
        amount     REAL NOT NULL,
        note       TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payout_methods (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL CHECK (kind IN ('upi','bank')),
        upi_id     TEXT,
        account_last4 TEXT,
        ifsc       TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        method_id  TEXT REFERENCES payout_methods(id) ON DELETE SET NULL,
        amount     REAL NOT NULL,
        status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','paid','failed')),
        reference  TEXT,
        created_at TEXT NOT NULL,
        settled_at TEXT
      )
    `);

    /* ---------------- ShiftConnect chat ---------------- */
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT PRIMARY KEY,
        shift_id   TEXT REFERENCES shifts(id) ON DELETE CASCADE,
        topic      TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_at    TEXT,
        PRIMARY KEY (conversation_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body            TEXT NOT NULL,
        created_at      TEXT NOT NULL
      )
    `);

    /* ---------------- Disputes ---------------- */
    await client.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id          TEXT PRIMARY KEY,
        shift_id    TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        hold_id     TEXT REFERENCES escrow_holds(id) ON DELETE SET NULL,
        raised_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        against_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
        reason      TEXT NOT NULL,
        detail      TEXT,
        status      TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','under_review','resolved')),
        resolution  TEXT CHECK (resolution IN ('release_worker','refund_manager','split')),
        resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        resolution_note TEXT,
        created_at  TEXT NOT NULL,
        resolved_at TEXT
      )
    `);

    /* ---------------- KYC documents ---------------- */
    await client.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        doc_type    TEXT NOT NULL
                    CHECK (doc_type IN ('aadhaar','pan','fssai','digilocker','other')),
        -- Never store a raw Aadhaar number; only the last 4 for display.
        number_last4 TEXT,
        file_data   TEXT,
        status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','rejected')),
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        review_note TEXT,
        created_at  TEXT NOT NULL,
        reviewed_at TEXT
      )
    `);

    /* ------------------------------------------------------------------
       Presence.

       One row per user, not an append-only log: presence is a current
       fact, and rewriting a single row keeps the realtime stream small.
       History, if it is ever wanted, belongs in audit_logs.

       `expires_at` is what makes this honest. A browser that is closed or
       loses power never sends "offline", so a status field alone would
       leave people showing as online forever. Anyone past their expiry is
       treated as offline no matter what `status` says.
    ------------------------------------------------------------------ */
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_presence (
        user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        status      TEXT NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('online','away','offline')),
        -- Set while the user is actively working a shift, so a venue can see
        -- "on site" rather than merely "app open".
        shift_id    TEXT REFERENCES shifts(id) ON DELETE SET NULL,
        last_seen_at TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);

    /* Shift lifecycle timestamps, added after the original schema shipped, so
       they are applied to existing tables rather than in CREATE TABLE. */
    await client.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS checked_in_at TEXT`);
    await client.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS completed_at TEXT`);

    await client.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_shifts_status_exp ON shifts(status, expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_responses_shift ON responses(shift_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_holds_shift ON escrow_holds(shift_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_holds_status ON escrow_holds(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_documents(user_id, status)');
    // Sweeping stale presence and listing who is live on a shift are the only
    // two queries this table serves.
    await client.query('CREATE INDEX IF NOT EXISTS idx_presence_expires ON user_presence(expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_presence_shift ON user_presence(shift_id) WHERE shift_id IS NOT NULL');

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
