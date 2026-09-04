import { test, assert, mkUser } from './helpers.js';

const { db } = await import('../src/db.js');
const auth = await import('../src/auth.js');
const { uid, nowIso } = await import('../src/config.js');
const { hashToken } = await import('../src/security.js');

test('passwordStrength scores passwords', () => {
  assert.equal(auth.passwordStrength(''), 0);
  assert.equal(auth.passwordStrength('short'), 0);
  assert.equal(auth.passwordStrength('weak1'), 1);
  assert.equal(auth.passwordStrength('Weak1!abc'), 4);
  assert.equal(auth.passwordStrength('Strong!Pass123'), 5);
});

test('assertStrongPassword accepts strong and rejects weak', () => {
  auth.assertStrongPassword('Strong!Pass123');
  assert.throws(() => auth.assertStrongPassword('weak'));
});

test('hashPassword/verifyPassword round-trip', () => {
  const hash = auth.hashPassword('secret!123');
  assert.ok(auth.verifyPassword('secret!123', hash));
  assert.ok(!auth.verifyPassword('wrong', hash));
  assert.notEqual(hash, 'secret!123');
});

test('serializeUser exposes safe fields and coerces booleans', () => {
  const row = { id: 'u1', role: 'chef', name: 'A', email: 'a@b.c', phone: '+911', active: 1, suspended: 0, banned: 0, verified_badge: 1, photo_data: null, available: 1, pin_enabled: 0, totp_enabled: 0, totp_secret: null, created_at: 'x' };
  const s = auth.serializeUser(row);
  assert.equal(s.id, 'u1');
  assert.equal(s.active, true);
  assert.equal(s.suspended, false);
  assert.equal(s.verifiedBadge, true);
  assert.equal(s.totpEnabled, false);
  assert.equal('password_hash' in s, false);
});

test('issueTokens persists a refresh token and rotates it', async () => {
  const { id } = await mkUser({ role: 'waiter' });
  const first = await auth.issueTokens(id, 'waiter');
  assert.ok(first.accessToken);
  assert.ok(first.refreshToken);

  const stored = await db.all(`SELECT * FROM refresh_tokens WHERE user_id = $1`, id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].token_hash, hashToken(first.refreshToken));

  const rotated = await auth.rotateRefresh(first.refreshToken);
  assert.ok(rotated);
  assert.notEqual(rotated.refreshToken, first.refreshToken);
  assert.equal((await db.get(`SELECT COUNT(*)::int n FROM refresh_tokens WHERE user_id = $1`, id)).n, 1);
  assert.equal(await auth.rotateRefresh(first.refreshToken), null);
});

test('rotateRefresh rejects unknown tokens', async () => {
  assert.equal(await auth.rotateRefresh('bogus-token'), null);
});

test('invalidateAllSessions clears every refresh token for a user', async () => {
  const { id } = await mkUser({ role: 'manager' });
  await auth.issueTokens(id, 'manager');
  await auth.issueTokens(id, 'manager');
  assert.equal((await db.get(`SELECT COUNT(*)::int n FROM refresh_tokens WHERE user_id = $1`, id)).n, 2);
  await auth.invalidateAllSessions(id);
  assert.equal((await db.get(`SELECT COUNT(*)::int n FROM refresh_tokens WHERE user_id = $1`, id)).n, 0);
});

test('generateOtp + verifyOtp happy path consumes the code', async () => {
  const code = await auth.generateOtp('+919800000001', 'signup');
  assert.match(code, /^\d{6}$/);
  assert.equal((await auth.verifyOtp('+919800000001', 'signup', code)).ok, true);
  assert.equal((await auth.verifyOtp('+919800000001', 'signup', code)).ok, false); // already consumed
});

test('verifyOtp fails on wrong code and locks out after 5 attempts', async () => {
  await auth.generateOtp('+919800000002', 'signup');
  for (let i = 0; i < 5; i++) {
    const r = await auth.verifyOtp('+919800000002', 'signup', '000000');
    if (r.ok) throw new Error('should not succeed with wrong code');
  }
  const r = await auth.verifyOtp('+919800000002', 'signup', '000000');
  assert.equal(r.ok, false);
  assert.match(r.reason, /wrong attempts/i);
});

test('verifyOtp rejects expired codes', async () => {
  const phone = '+919800000003';
  const id = uid('otp');
  await db.run(`INSERT INTO otps (id, phone, purpose, code_hash, attempts, expires_at, created_at) VALUES ($1,$2,$3,$4,0,$5,$6)`,
    id, phone, 'signup', hashToken('123456'), new Date(Date.now() - 1000).toISOString(), nowIso());
  const r = await auth.verifyOtp(phone, 'signup', '123456');
  assert.equal(r.ok, false);
  assert.match(r.reason, /expired/i);
});

test('verifyOtp reports when no code was sent', async () => {
  const r = await auth.verifyOtp('+910000000000', 'signup', '123456');
  assert.equal(r.ok, false);
  assert.match(r.reason, /No code/i);
});
