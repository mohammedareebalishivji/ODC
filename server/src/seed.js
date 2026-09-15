import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit, initDatabase } from './db.js';
import { uid, nowIso, DEV, DATABASE_URL } from './config.js';
import { hashPassword } from './auth.js';
import { generateTotpSecret, totp, staticCodeFor } from './security.js';
import { hashToken } from './security.js';

/**
 * Demo/test accounts share one published password (Test@1234), so they must
 * never be created in a hosted database. NODE_ENV alone is not enough of a
 * guard: pointing a local dev server at Supabase would otherwise seed them
 * straight into the cloud. Require an explicit opt-in for a remote host.
 */
export function demoSeedAllowed() {
  if (!DEV) return false;
  let host = '';
  try { host = new URL(DATABASE_URL).hostname; } catch { /* treat as local */ }
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocal) return true;
  if (process.env.ODC_ALLOW_REMOTE_DEMO_SEED === 'yes') {
    console.warn(`[seed] WARNING: seeding demo accounts into remote host ${host} (explicitly allowed).`);
    return true;
  }
  console.log(`[seed] Skipped demo/test accounts — ${host} is not a local database.`);
  console.log('[seed] Set ODC_ALLOW_REMOTE_DEMO_SEED=yes to override (not recommended).');
  return false;
}

export async function ensureAdmin() {
  const existing = await db.get(`SELECT * FROM users WHERE role = 'admin'`);
  if (existing) {
    const code = existing.static_code_override || staticCodeFor(existing.email);
    await db.run(`UPDATE users SET login_pin = $1, pin_enabled = 1 WHERE id = $2`, hashToken(code), existing.id);
    if (DEV) {
      console.log('[admin] Intranet path ready. Sign in with the permanent code below.');
      console.log('[admin] Current TOTP code:', totp(existing.totp_secret));
      console.log('[admin] Permanent code:', existing.static_code_override || staticCodeFor(existing.email) + (existing.static_code_override ? '' : ' (never changes)'));
    }
    return existing;
  }
  const email = (process.env.ODC_ADMIN_EMAIL || 'admin@odc-internal.com').toLowerCase();
  const password = process.env.ODC_ADMIN_PASSWORD || 'OdcAdmin!2026';
  const secret = generateTotpSecret();
  const id = uid('usr');
  const result = await db.run(
    `INSERT INTO users (id, role, name, email, password_hash, active, totp_secret, login_pin, pin_enabled, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,1,$6,$7,1,$8,$9) ON CONFLICT (email) DO NOTHING`,
    id, 'admin', 'Platform Owner', email, hashPassword(password), secret, hashToken(staticCodeFor(email)), nowIso(), nowIso()
  );
  if (result.changes === 0) {
    const existing = await db.get(`SELECT * FROM users WHERE email = $1`, email);
    await audit('admin_created', 'Initial admin account provisioned', existing.id);
    return existing;
  }
  await audit('admin_created', 'Initial admin account provisioned', id);
  if (DEV) {
    console.log('=============================');
    console.log('[admin] First-run: admin account created.');
    console.log(`[admin] URL (private): ${process.env.ODC_ADMIN_URL || 'http://localhost:4000/tail/z7k9x2/admin'}`);
    console.log(`[admin] Email: ${email}`);
    console.log(`[admin] Password: ${password}`);
    console.log(`[admin] TOTP secret: ${secret}`);
    console.log(`[admin] Permanent code: ${staticCodeFor(email)} (never changes)`);
    console.log('=============================');
  }
  return { id, email };
}

const DEMO = [
  {
    role: 'manager', name: 'Priya Shah', phone: '+910000000001', email: 'priya@tamdrum.in',
    password: 'Bistro!2026', businessName: 'Tandoor House', businessType: 'restaurant', businessAddress: 'Bandra West, Mumbai',
  },
  {
    role: 'chef', name: 'Arjun Mehta', phone: '+910000000002', email: 'arjun@chef.in',
    password: 'Bistro!2026', specialties: ['Tandoor', 'North Indian', 'BBQ/Grill'], years: 8,
    photo: null,
  },
  {
    role: 'chef', name: 'Lena D\u2019Souza', phone: '+910000000003', email: 'lena@chef.in',
    password: 'Bistro!2026', specialties: ['Bakery/Pastry', 'Continental'], years: 5,
  },
  {
    role: 'waiter', name: 'Ravi Kumar', phone: '+910000000004', email: 'ravi@waiter.in',
    password: 'Bistro!2026', experience: '4+ years', languages: ['English', 'Hindi', 'Kannada'],
  },
];

export async function seedDemo() {
  const count = (await db.get(`SELECT COUNT(*)::int n FROM users WHERE role != 'admin'`)).n;
  if (count > 0) return 0;
  let made = 0;
  for (const d of DEMO) {
    const id = uid('usr');
    const res = await db.run(
      `INSERT INTO users (id, role, name, email, phone, password_hash, active, verified_badge, available, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,1,1,1,$7,$8) ON CONFLICT (phone) DO NOTHING`,
      id, d.role, d.name, d.email, d.phone, hashPassword(d.password), nowIso(), nowIso()
    );
    if (res.changes === 0) {
      const existing = await db.get(`SELECT id FROM users WHERE phone = $1`, d.phone);
      if (existing) { made++; continue; }
    }
    const isWorker = d.role === 'chef' || d.role === 'waiter';
    if (isWorker) await db.run(`UPDATE users SET available = 1 WHERE id = $1`, id);
    if (d.role === 'manager') {
      await db.run(`INSERT INTO manager_profiles (user_id, business_name, business_type, business_address) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
        id, d.businessName, d.businessType, d.businessAddress);
    }
    if (d.role === 'chef') {
      await db.run(`INSERT INTO chef_profiles (user_id, specialties, years_experience) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING`,
        id, JSON.stringify(d.specialties), d.years);
      await db.run(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES ($1,$2,$3,NULL,$4)`,
        uid('dev'), id, 'demo', nowIso());
    }
    if (d.role === 'waiter') {
      await db.run(`INSERT INTO waiter_profiles (user_id, experience_level, languages) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING`,
        id, d.experience, JSON.stringify(d.languages));
      await db.run(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES ($1,$2,$3,NULL,$4)`,
        uid('dev'), id, 'demo', nowIso());
    }
    await audit('demo_seed', `Demo ${d.role} created`, id);
    made++;
  }
  return made;
}

const TEST_PASSWORD = 'Test@1234';

// The test super admin must own +91 99990 00004: test/api.otplogin.test.js
// requests an OTP code for that number and asserts the admin portal rule
// blocks a session. Admin phones are deliberately unique from the app accounts.
const SUPERADMIN_PHONE = '+919999000004';

export async function seedTestAccounts() {
  const mk = async (role, name, phone, email, fields) => {
    const id = uid('usr');
    const isWorker = role === 'chef' || role === 'waiter';
    let userId;
    try {
      const res = await db.run(
        `INSERT INTO users (id, role, name, email, phone, password_hash, active, verified_badge, available, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,1,$7,$8,$9) ON CONFLICT DO NOTHING`,
        id, role, name, email, phone, hashPassword(TEST_PASSWORD), isWorker ? 1 : 0, nowIso(), nowIso()
      );
      userId = res.changes === 0 ? (await db.get(`SELECT id FROM users WHERE phone = $1 OR email = $2`, phone, email)).id : id;
    } catch (err) {
      if (err.code === '23505') {
        const existing = await db.get(`SELECT id FROM users WHERE phone = $1 OR email = $2`, phone, email);
        userId = existing.id;
      } else {
        throw err;
      }
    }
    await db.run(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES ($1,$2,$3,NULL,$4) ON CONFLICT DO NOTHING`,
      uid('dev'), userId, 'test', nowIso());
    if (role === 'manager') {
      await db.run(`INSERT INTO manager_profiles (user_id, business_name, business_type, business_address, license_file) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING`,
        userId, fields.businessName, fields.businessType, fields.businessAddress, '(sample license on file)');
    }
    if (role === 'chef') {
      await db.run(`INSERT INTO chef_profiles (user_id, specialties, years_experience, cert_file) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
        userId, JSON.stringify(fields.specialties), fields.years, '(sample cert on file)');
    }
    if (role === 'waiter') {
      await db.run(`INSERT INTO waiter_profiles (user_id, experience_level, languages, id_file) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
        userId, fields.experience, JSON.stringify(fields.languages), '(sample ID on file)');
    }
    await audit('test_seed', `Test ${role} account created`, userId);
    return userId;
  };

  const managerId = await mk('manager', 'Test Manager', '+919999000001', 'testmanager@odc.in', {
    businessName: 'Test Diner', businessType: 'restaurant', businessAddress: 'Test Road, Central City',
  });
  const chefId = await mk('chef', 'Test Chef', '+919999000002', 'testchef@odc.in', {
    specialties: ['Tandoor', 'Continental', 'BBQ/Grill'], years: 6,
  });
  const waiterId = await mk('waiter', 'Test Waiter', '+919999000003', 'testwaiter@odc.in', {
    experience: '4–7 years', languages: ['English', 'Hindi', 'Tamil'],
  });
  await mk('manager', 'Test Manager 2', '+919999000007', 'testmanager2@odc.in', {
    businessName: 'Second Test Diner', businessType: 'restaurant', businessAddress: 'Test Lane, Central City',
  });
  await mk('chef', 'Test Chef 2', '+919999000008', 'testchef2@odc.in', {
    specialties: ['Bakery/Pastry', 'Continental', 'South Indian'], years: 3,
  });
  await mk('waiter', 'Test Waiter 2', '+919999000009', 'testwaiter2@odc.in', {
    experience: '1–3 years', languages: ['English', 'Marathi', 'Kannada'],
  });

  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;

  const existingOpen = await db.get(`SELECT 1 FROM shifts WHERE manager_id = $1 AND status = 'open'`, managerId);
  if (!existingOpen) {
    for (const [role, specialty] of [['chef', 'Tandoor'], ['waiter', null]]) {
      const id = uid('shf');
      await db.run(
        `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, lat, lng, pay_min, pay_max, notes, dress_code, status, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',$15,$16)`,
        id, managerId, role, specialty, today, 600, 960, 'Test Diner, Central City', 19.06, 72.83,
        role === 'chef' ? 120 : 80, role === 'chef' ? 150 : 100,
        'Set up for the evening rush. Friendly crew welcome.', 'Black on black',
        new Date().toISOString(), new Date(Date.now() + 12 * 3600_000).toISOString()
      );
    }
  }

  const existingMatch = await db.get(`SELECT 1 FROM shifts WHERE manager_id = $1 AND status = 'matched'`, managerId);
  if (!existingMatch) {
    const id = uid('shf');
    const past = new Date(Date.now() - 2 * 86400_000).toISOString();
    const pastDay = twoDaysAgo();
    await db.run(
      `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, pay_min, pay_max, notes, status, created_at, expires_at, matched_at, matched_worker_id, agreed_pay)
       VALUES ($1,$2,'chef','Tandoor',$3,$4,$5,$6,$7,$8,$9, 'matched', $10, $11, $12, $13, $14)`,
      id, managerId, pastDay, 600, 900, 'Test Diner, Central City', 120, 150, 'Past event service',
      past, past, past, chefId, 135
    );
    const rate = await getFeeRateLocal();
    const fee = Math.round(135 * rate * 100) / 100;
    await db.run(
      `INSERT INTO fee_records (shift_id, agreed_pay, fee_rate, fee_amount, worker_payout, settled, created_at) VALUES ($1,$2,$3,$4,$5,1,$6)`,
      id, 135, rate, fee, 135 - fee, past
    );
    await db.run(`INSERT INTO ratings (id, shift_id, from_user, to_user, stars, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      uid('rat'), id, managerId, chefId, 5, 'Sharp, on time, helped cover grill.', past);
    await db.run(`INSERT INTO ratings (id, shift_id, from_user, to_user, stars, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      uid('rat'), id, chefId, managerId, 5, 'Clear brief, paid agreed amount.', past);
    await audit('test_seed', 'Test matched shift + ratings created', managerId);
  }

  const adminEmail = 'testsuperadmin@odc.in';
  const sa = await db.get(`SELECT id, phone, totp_secret, static_code_override FROM users WHERE role = 'admin' AND email = $1`, adminEmail);
  let adminId;
  let secret;
  if (sa) {
    adminId = sa.id;
    secret = sa.totp_secret || generateTotpSecret();
    if (!sa.totp_secret) await db.run(`UPDATE users SET totp_secret = $1 WHERE id = $2`, secret, adminId);
    if (!sa.phone) {
      try {
        await db.run(`UPDATE users SET phone = $1 WHERE id = $2`, SUPERADMIN_PHONE, adminId);
      } catch (err) {
        // Another seeded account already owns this number; idempotency matters
        // more than forcing it here.
        if (err.code !== '23505') throw err;
      }
    }
  } else {
    adminId = uid('usr');
    secret = generateTotpSecret();
    const res = await db.run(
      `INSERT INTO users (id, role, name, email, phone, password_hash, active, totp_secret, login_pin, pin_enabled, verified_badge, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,1,1,$9,$10) ON CONFLICT DO NOTHING`,
      adminId, 'admin', 'Test Super Admin', adminEmail, SUPERADMIN_PHONE,
      hashPassword(TEST_PASSWORD), secret, hashToken(staticCodeFor(adminEmail)), nowIso(), nowIso()
    );
    if (res.changes === 0) {
      const existing = await db.get(`SELECT id FROM users WHERE email = $1`, adminEmail);
      adminId = existing.id;
    } else {
      await audit('test_seed', 'Test super admin account created', adminId);
    }
  }
  await db.run(`UPDATE users SET login_pin = $1, pin_enabled = 1 WHERE id = $2`,
    hashToken(sa && sa.static_code_override ? sa.static_code_override : staticCodeFor(adminEmail)), adminId
  );
  if (DEV) {
    console.log('=============================');
    console.log('[test-superadmin] Email: ' + adminEmail);
    console.log('[test-superadmin] Password: ' + TEST_PASSWORD);
    console.log('[test-superadmin] Permanent code: ' + (sa && sa.static_code_override ? sa.static_code_override : staticCodeFor(adminEmail)) + ' (never changes)');
    console.log('=============================');
  }

  return { manager: managerId, chef: chefId, waiter: waiterId, superadmin: adminId };
}

function twoDaysAgo() {
  const d = new Date(Date.now() - 2 * 86400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getFeeRateLocal() {
  const row = await db.get(`SELECT rate FROM fees ORDER BY id DESC LIMIT 1`);
  return row ? row.rate : 0.1;
}

/* --- CLI entry: `node src/seed.js` (npm run seed-demo) -----------------------
   Runs seedDemo + seedTestAccounts against the configured DATABASE_URL,
   applying the same remote-host guard as the server boot. To seed a hosted
   database on purpose:  ODC_ALLOW_REMOTE_DEMO_SEED=yes npm run seed-demo
--------------------------------------------------------------------------- */
const isCli = (() => {
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); } catch { return false; }
})();

if (isCli) {
  console.log('[seed] Running demo/test seed…');
  (async () => {
    await initDatabase();
    if (!demoSeedAllowed()) process.exit(0);
    const n = await seedDemo();
    if (n) console.log(`[seed] Created ${n} demo account(s).`);
    await seedTestAccounts();
    console.log('[seed] Test accounts ready: manager / chef / waiter / superadmin (password: Test@1234).');
    process.exit(0);
  })().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
