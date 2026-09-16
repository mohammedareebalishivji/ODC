import crypto from 'node:crypto';
import pg from 'pg';

const TEST_DB_URL = process.env.ODC_TEST_DB_URL || 'postgresql://localhost:5432/odc_test';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ODC_JWT_SECRET ||= 'odc-test-secret-0123456789abcdef0123456789abcdef';
/*
 * A webhook secret so signature verification is exercised for real rather than
 * stubbed. Deliberately no RAZORPAY_KEY_ID / _KEY_SECRET: with those unset the
 * provider counts as unconfigured, holds open straight to 'held' as they
 * always have, and the existing escrow tests are unaffected. Tests that need
 * an unfunded hold put one in that state themselves.
 */
process.env.RAZORPAY_WEBHOOK_SECRET ||= 'whsec-test-0123456789abcdef';

let testPool = null;

export function getTestPool() {
  if (!testPool) {
    testPool = new pg.Pool({ connectionString: TEST_DB_URL, max: 5 });
  }
  return testPool;
}

export { default as test } from 'node:test';
export { strict as assert } from 'node:assert';

let app, authMod, secMod, confMod, seedMod;
let server, base;

export async function appModule() {
  app ??= (await import('../src/app.js')).app;
  return app;
}

export async function authModule() {
  authMod ??= await import('../src/auth.js');
  return authMod;
}

export async function securityModule() {
  secMod ??= await import('../src/security.js');
  return secMod;
}

export async function configModule() {
  confMod ??= await import('../src/config.js');
  return confMod;
}

export async function seedModule() {
  seedMod ??= await import('../src/seed.js');
  return seedMod;
}

export async function dbModule() {
  const mod = await import('../src/db.js');
  return mod;
}

export async function notifyModule() {
  return await import('../src/notify.js');
}

export async function jobsModule() {
  return await import('../src/jobs.js');
}

export async function start() {
  const { initDatabase } = await dbModule();
  await initDatabase();
  await resetDb();
  const { ensureAdmin, seedDemo, seedTestAccounts } = await seedModule();
  await ensureAdmin();
  await seedDemo();
  await seedTestAccounts();
  if (!server) {
    await appModule();
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
  }
  const addr = server.address();
  base = `http://127.0.0.1:${addr.port}`;
  return base;
}

export async function stop() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  }
  const { pool } = await dbModule();
  await pool.end();
}

export async function resetRateLimit() {
  const { resetRateLimiter } = await import('../src/rate.js');
  resetRateLimiter();
}

export async function api(pathname, { method = 'GET', body, token, headers = {} } = {}) {
  if (!base) await start();
  const res = await fetch(base + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const PHONE_COUNTER = { n: 10000000 + Math.floor(Math.random() * 90000000) };

function nextPhone() {
  PHONE_COUNTER.n += 1;
  return `+91${PHONE_COUNTER.n}`;
}

export function uniquePhone() {
  return nextPhone();
}

export function uniqueEmail(tag) {
  return `${tag || 'u'}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}@test.odc`;
}

export async function mkUser({ role = 'waiter', name = 'Test User', phone, email, active = 1, verified = 0, available = 0, password = 'Strong!Pass123', suspended = 0, banned = 0 }) {
  const { db } = await dbModule();
  const { hashPassword } = await authModule();
  const { uid, nowIso } = await configModule();
  const id = uid('usr');
  await db.run(
    `INSERT INTO users (id, role, name, email, phone, password_hash, active, suspended, banned, verified_badge, available, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    id, role, name, email || null, phone || nextPhone(), hashPassword(password), active, suspended, banned, verified ? 1 : 0, available ? 1 : 0, nowIso(), nowIso()
  );
  if (role === 'manager') {
    await db.run(`INSERT INTO manager_profiles (user_id, business_name, business_type, business_address) VALUES ($1,$2,$3,$4)`,
      id, 'Test Diner', 'restaurant', 'Test Road');
  }
  if (role === 'chef') {
    await db.run(`INSERT INTO chef_profiles (user_id, specialties, years_experience) VALUES ($1,$2,$3)`,
      id, JSON.stringify(['Tandoor', 'Continental']), 5);
  }
  if (role === 'waiter') {
    await db.run(`INSERT INTO waiter_profiles (user_id, experience_level, languages) VALUES ($1,$2,$3)`,
      id, '4+ years', JSON.stringify(['English', 'Hindi']));
  }
  return { id, password };
}

export async function signupAndVerify({ role, name, phone, email, password = 'Strong!Pass123', ...extra }) {
  const r = await api('/api/auth/signup', {
    method: 'POST',
    body: { role, name, phone, email, password, ...extra },
  });
  if (r.status !== 201) throw new Error(`signup failed (${r.status}): ${JSON.stringify(r.body)}`);
  const v = await api('/api/auth/verify', { method: 'POST', body: { phone, code: r.body.devCode } });
  if (v.status !== 200) throw new Error(`verify failed (${v.status}): ${JSON.stringify(v.body)}`);
  return { userId: r.body.userId, ...v.body };
}

export async function login(identifier, password, extra = {}) {
  const r = await api('/api/auth/login', { method: 'POST', body: { identifier, password, ...extra } });
  return r;
}

export async function newUser(role, name) {
  const phone = uniquePhone();
  const email = uniqueEmail(role);
  const res = await signupAndVerify({ role, name: name || role, phone, email });
  return { ...res, phone, email };
}

export async function postShift(token, overrides = {}) {
  const date = futureDate();
  return api('/api/shifts', {
    method: 'POST',
    token,
    body: {
      role: 'chef',
      specialty: 'Tandoor',
      date,
      startMin: 600,
      endMin: 960,
      locationName: 'Test Diner, Central City',
      lat: 19.06,
      lng: 72.83,
      payMin: 120,
      payMax: 150,
      ...overrides,
    },
  });
}

export function futureDate(days = 3) {
  const d = new Date(Date.now() + days * 86400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function insertShift({ managerId, role = 'chef', specialty = 'Tandoor', status = 'open', expiresInMs = 12 * 3600_000, payMin = 120, payMax = 150 }) {
  const { db } = await dbModule();
  const { uid, nowIso } = await configModule();
  const id = uid('shf');
  await db.run(
    `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, lat, lng, pay_min, pay_max, notes, dress_code, status, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    id, managerId, role, specialty, futureDate(), 600, 960, 'Test Diner', 19.06, 72.83, payMin, payMax,
    null, null, status, nowIso(), new Date(Date.now() + expiresInMs).toISOString()
  );
  return id;
}

/**
 * Refuse to wipe anything that is not a local database.
 *
 * resetDb() deletes every row in every table. Since the server now reads a
 * .env that may point at a hosted Postgres, a mis-ordered import or a stray
 * DATABASE_URL could otherwise aim the whole suite at production and destroy
 * it. This check is deliberately fail-closed.
 */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL || '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* handled below */ }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    throw new Error(
      `REFUSING to reset a non-local database (host: ${host || 'unparseable'}). `
      + 'The test suite deletes every row in every table and must only ever run '
      + 'against a local Postgres. Check ODC_TEST_DB_URL / DATABASE_URL.'
    );
  }
}

export async function resetDb() {
  assertLocalDatabase();
  const { db } = await dbModule();
  /*
   * Every table in the schema, discovered rather than listed.
   *
   * This used to be a hand-maintained list of DELETEs, which quietly stopped
   * being "every table" each time one was added. webhook_events was the case
   * that bit: it has no foreign key, so unlike the rest it was not even
   * cascaded away by deleting users, and rows survived between files to
   * collide with the next run. TRUNCATE ... CASCADE cannot drift.
   */
  const tables = await db.all(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await db.exec(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

