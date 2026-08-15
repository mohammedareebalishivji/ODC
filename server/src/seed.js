import { db, audit } from './db.js';
import { uid, nowIso, DEV } from './config.js';
import { hashPassword } from './auth.js';
import { generateTotpSecret, totp } from './security.js';

export function ensureAdmin() {
  const existing = db.prepare(`SELECT * FROM users WHERE role = 'admin'`).get();
  if (existing) {
    if (DEV) {
      console.log('[admin] Intranet path ready. Use OTP code shown by ODC_ADMIN env / authenticator app.');
      console.log('[admin] Current TOTP code:', totp(existing.totp_secret));
    }
    return existing;
  }
  const email = (process.env.ODC_ADMIN_EMAIL || 'admin@odc-internal.com').toLowerCase();
  const password = process.env.ODC_ADMIN_PASSWORD || 'OdcAdmin!2026';
  const secret = generateTotpSecret();
  const id = uid('usr');
  db.prepare(
    `INSERT INTO users (id, role, name, email, password_hash, active, totp_secret, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?,?)`
  ).run(id, 'admin', 'Platform Owner', email, hashPassword(password), secret, nowIso(), nowIso());
  audit('admin_created', 'Initial admin account provisioned', id);
  if (DEV) {
    console.log('=============================');
    console.log('[admin] First-run: admin account created.');
    console.log(`[admin] URL (private): ${process.env.ODC_ADMIN_URL || 'http://localhost:4000/tail/z7k9x2/admin'}`);
    console.log(`[admin] Email: ${email}`);
    console.log(`[admin] Password: ${password}`);
    console.log(`[admin] TOTP secret: ${secret}`);
    console.log(`[admin] Current 2FA code: ${totp(secret)}`);
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

export function seedDemo() {
  const count = db.prepare(`SELECT COUNT(*) n FROM users WHERE role != 'admin'`).get().n;
  if (count > 0) return 0;
  let made = 0;
  for (const d of DEMO) {
    const id = uid('usr');
    db.prepare(
      `INSERT INTO users (id, role, name, email, phone, password_hash, active, verified_badge, available, created_at, updated_at) VALUES (?,?,?,?,?,?,1,1,1,?,?)`
    ).run(id, d.role, d.name, d.email, d.phone, hashPassword(d.password), nowIso(), nowIso());
    const isWorker = d.role === 'chef' || d.role === 'waiter';
    if (isWorker) db.prepare(`UPDATE users SET available = 1 WHERE id = ?`).run(id);
    if (d.role === 'manager') {
      db.prepare(`INSERT INTO manager_profiles (user_id, business_name, business_type, business_address) VALUES (?,?,?,?)`)
        .run(id, d.businessName, d.businessType, d.businessAddress);
    }
    if (d.role === 'chef') {
      db.prepare(`INSERT INTO chef_profiles (user_id, specialties, years_experience) VALUES (?,?,?)`)
        .run(id, JSON.stringify(d.specialties), d.years);
      db.prepare(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES (?,?,?,NULL,?)`)
        .run(uid('dev'), id, 'demo', nowIso());
    }
    if (d.role === 'waiter') {
      db.prepare(`INSERT INTO waiter_profiles (user_id, experience_level, languages) VALUES (?,?,?)`)
        .run(id, d.experience, JSON.stringify(d.languages));
      db.prepare(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES (?,?,?,NULL,?)`)
        .run(uid('dev'), id, 'demo', nowIso());
    }
    audit('demo_seed', `Demo ${d.role} created`, id);
    made++;
  }
  return made;
}

const TEST_PASSWORD = 'Test@1234';

export function seedTestAccounts() {
  const mk = (role, name, phone, email, fields) => {
    const exists = db.prepare(`SELECT id FROM users WHERE phone = ?`).get(phone);
    if (exists) return exists.id;
    const id = uid('usr');
    const isWorker = role === 'chef' || role === 'waiter';
    db.prepare(
      `INSERT INTO users (id, role, name, email, phone, password_hash, active, verified_badge, available, created_at, updated_at)
       VALUES (?,?,?,?,?,?,1,1,?,?,?)`
    ).run(id, role, name, email, phone, hashPassword(TEST_PASSWORD), isWorker ? 1 : 0, nowIso(), nowIso());
    db.prepare(`INSERT INTO devices (id, user_id, name, subscription, created_at) VALUES (?,?,?,NULL,?)`)
      .run(uid('dev'), id, 'test', nowIso());
    if (role === 'manager') {
      db.prepare(`INSERT INTO manager_profiles (user_id, business_name, business_type, business_address, license_file) VALUES (?,?,?,?,?)`)
        .run(id, fields.businessName, fields.businessType, fields.businessAddress, '(sample license on file)');
    }
    if (role === 'chef') {
      db.prepare(`INSERT INTO chef_profiles (user_id, specialties, years_experience, cert_file) VALUES (?,?,?,?)`)
        .run(id, JSON.stringify(fields.specialties), fields.years, '(sample cert on file)');
    }
    if (role === 'waiter') {
      db.prepare(`INSERT INTO waiter_profiles (user_id, experience_level, languages, id_file) VALUES (?,?,?,?)`)
        .run(id, fields.experience, JSON.stringify(fields.languages), '(sample ID on file)');
    }
    audit('test_seed', `Test ${role} account created`, id);
    return id;
  };

  const managerId = mk('manager', 'Test Manager', '+919999000001', 'testmanager@odc.in', {
    businessName: 'Test Diner', businessType: 'restaurant', businessAddress: 'Test Road, Central City',
  });
  const chefId = mk('chef', 'Test Chef', '+919999000002', 'testchef@odc.in', {
    specialties: ['Tandoor', 'Continental', 'BBQ/Grill'], years: 6,
  });
  const waiterId = mk('waiter', 'Test Waiter', '+919999000003', 'testwaiter@odc.in', {
    experience: '4–7 years', languages: ['English', 'Hindi', 'Tamil'],
  });

  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;

  // One live open shift for each role so dashboards are not empty.
  const existingOpen = db.prepare(`SELECT 1 FROM shifts WHERE manager_id = ? AND status = 'open'`).get(managerId);
  if (!existingOpen) {
    for (const [role, specialty] of [['chef', 'Tandoor'], ['waiter', null]]) {
      const id = uid('shf');
      db.prepare(
        `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, lat, lng, pay_min, pay_max, notes, dress_code, status, created_at, expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?)`
      ).run(id, managerId, role, specialty, today, 600, 960, 'Test Diner, Central City', 19.06, 72.83,
            role === 'chef' ? 120 : 80, role === 'chef' ? 150 : 100,
            'Set up for the evening rush. Friendly crew welcome.', 'Black on black',
            new Date().toISOString(), new Date(Date.now() + 12 * 3600_000).toISOString());
    }
  }

  // One completed shift between the test chef and manager so ratings/revenue exist.
  const existingMatch = db.prepare(`SELECT 1 FROM shifts WHERE manager_id = ? AND status = 'matched'`).get(managerId);
  if (!existingMatch) {
    const id = uid('shf');
    const past = new Date(Date.now() - 2 * 86400_000).toISOString();
    db.prepare(
      `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, pay_min, pay_max, notes, status, created_at, expires_at, matched_at, matched_worker_id, agreed_pay)
       VALUES (?,?,?,'Tandoor',?,?,?,?,?,?,?, 'matched', ?, ?, ?, ?, ?)`
    ).run(id, managerId, 'chef', twoDaysAgo(), 600, 900, 'Test Diner, Central City', 120, 150, 'Past event service',
          past, past, past, chefId, 135);
    const rate = getFeeRateLocal();
    const fee = Math.round(135 * rate * 100) / 100;
    db.prepare(
      `INSERT INTO fee_records (shift_id, agreed_pay, fee_rate, fee_amount, worker_payout, settled, created_at) VALUES (?,?,?,?,?,1,?)`
    ).run(id, 135, rate, fee, 135 - fee, past);
    db.prepare(`INSERT INTO ratings (id, shift_id, from_user, to_user, stars, comment, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(uid('rat'), id, managerId, chefId, 5, 'Sharp, on time, helped cover grill.', past);
    db.prepare(`INSERT INTO ratings (id, shift_id, from_user, to_user, stars, comment, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(uid('rat'), id, chefId, managerId, 5, 'Clear brief, paid agreed amount.', past);
    audit('test_seed', 'Test matched shift + ratings created', managerId);
  }

  return { manager: managerId, chef: chefId, waiter: waiterId };
}

function twoDaysAgo() {
  const d = new Date(Date.now() - 2 * 86400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getFeeRateLocal() {
  const row = db.prepare(`SELECT rate FROM fees ORDER BY id DESC LIMIT 1`).get();
  return row ? row.rate : 0.1;
}