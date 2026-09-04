import { test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, newUser } from './helpers.js';

test.before(async () => start());
test.after(async () => stop());

test('GET /health returns service metadata', async () => {
  const r = await api('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.feeRate, 0.1);
});

test('signup validates input', async () => {
  const phone = uniquePhone();
  const bad = [
    { body: { role: 'plumber', name: 'X', phone, password: 'Strong!Pass123' }, msg: /role/i },
    { body: { role: 'waiter', name: 'X', phone, password: 'Strong!Pass123' }, msg: /name/i },
    { body: { role: 'waiter', name: 'Test', phone: 'nope', password: 'Strong!Pass123' }, msg: /phone/i },
    { body: { role: 'waiter', name: 'Test', phone, email: 'not-an-email', password: 'Strong!Pass123' }, msg: /email/i },
    { body: { role: 'waiter', name: 'Test', phone, password: 'weak' }, msg: /characters/i },
  ];
  for (const c of bad) {
    const r = await api('/api/auth/signup', { method: 'POST', body: c.body });
    assert.equal(r.status, 400, JSON.stringify(c.body));
    assert.match(r.body.error, c.msg);
  }
});

test('signup rejects duplicate phone numbers', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('dup');
  const r1 = await api('/api/auth/signup', { method: 'POST', body: { role: 'waiter', name: 'One', phone, email, password: 'Strong!Pass123' } });
  assert.equal(r1.status, 201);
  const r2 = await api('/api/auth/signup', { method: 'POST', body: { role: 'waiter', name: 'Two', phone, email: uniqueEmail('dup'), password: 'Strong!Pass123' } });
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /already registered/i);
});

test('signup -> verify -> active account with tokens', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('sv');
  const s = await api('/api/auth/signup', { method: 'POST', body: { role: 'chef', name: 'Chef One', phone, email, password: 'Strong!Pass123', specialties: ['Tandoor'] } });
  assert.equal(s.status, 201);
  assert.ok(s.body.userId);
  assert.equal(s.body.needsVerify, true);
  assert.match(s.body.devCode, /^\d{6}$/);

  const v = await api('/api/auth/verify', { method: 'POST', body: { phone, code: s.body.devCode } });
  assert.equal(v.status, 200);
  assert.equal(v.body.user.active, true);
  assert.ok(v.body.accessToken);
  assert.ok(v.body.refreshToken);

  // Verify endpoint is idempotent-safe: reusing is rejected once active.
  const v2 = await api('/api/auth/verify', { method: 'POST', body: { phone, code: s.body.devCode } });
  assert.equal(v2.status, 400);
});

test('signup-resend only works for inactive accounts', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('resend');
  const s = await api('/api/auth/signup', { method: 'POST', body: { role: 'waiter', name: 'Resend', phone, email, password: 'Strong!Pass123' } });
  const r = await api('/api/auth/signup-resend', { method: 'POST', body: { phone } });
  assert.equal(r.status, 200);
  assert.ok(r.body.devCode);
  const v = await api('/api/auth/verify', { method: 'POST', body: { phone, code: r.body.devCode } });
  assert.equal(v.status, 200);
  const r2 = await api('/api/auth/signup-resend', { method: 'POST', body: { phone } });
  assert.equal(r2.status, 400);
});

test('login works with email or phone and rejects bad credentials', async () => {
  const u = await newUser('waiter', 'Login Test');

  const byEmail = await api('/api/auth/login', { method: 'POST', body: { identifier: u.email, password: 'Strong!Pass123' } });
  assert.equal(byEmail.status, 200);
  assert.ok(byEmail.body.accessToken);

  const byPhone = await api('/api/auth/login', { method: 'POST', body: { identifier: u.phone, password: 'Strong!Pass123' } });
  assert.equal(byPhone.status, 200);
  assert.equal(byPhone.body.user.active, true);
  assert.ok(byPhone.body.accessToken);

  const badPw = await api('/api/auth/login', { method: 'POST', body: { identifier: u.phone, password: 'WrongPass!123' } });
  assert.equal(badPw.status, 400);
  assert.match(badPw.body.error, /did not match/i);

  const missing = await api('/api/auth/login', { method: 'POST', body: { identifier: '+911111111111', password: 'Strong!Pass123' } });
  assert.equal(missing.status, 400);
});

test('login for an inactive account is rejected', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('inactive');
  await api('/api/auth/signup', { method: 'POST', body: { role: 'waiter', name: 'Inactive', phone, email, password: 'Strong!Pass123' } });
  const r = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'Strong!Pass123' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not active/i);
});

test('refresh rotates the refresh token', async () => {
  const u = await newUser('manager', 'Refresh Test');
  const r = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: u.refreshToken } });
  assert.equal(r.status, 200);
  assert.ok(r.body.accessToken);
  assert.notEqual(r.body.refreshToken, u.refreshToken);

  const again = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: u.refreshToken } });
  assert.equal(again.status, 400); // old token is dead after rotation

  const bogus = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: 'not-a-token' } });
  assert.equal(bogus.status, 400);
});

test('logout requires auth and invalidates the refresh token', async () => {
  const u = await newUser('waiter', 'Logout Test');
  const noAuth = await api('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal(noAuth.status, 401);

  const r = await api('/api/auth/logout', { method: 'POST', token: u.accessToken, body: { refreshToken: u.refreshToken } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);

  const refresh = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: u.refreshToken } });
  assert.equal(refresh.status, 400);
});

test('forgot-password -> reset-password uses the OTP flow', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('reset');
  const s = await api('/api/auth/signup', { method: 'POST', body: { role: 'waiter', name: 'Reset Me', phone, email, password: 'Strong!Pass123' } });
  const v = await api('/api/auth/verify', { method: 'POST', body: { phone, code: s.body.devCode } });
  assert.equal(v.status, 200);

  const forgot = await api('/api/auth/forgot-password', { method: 'POST', body: { phone } });
  assert.equal(forgot.status, 200);
  assert.match(forgot.body.message, /If this account exists/i);

  // Grab the reset code by generating one directly via the auth module.
  const auth = await import('../src/auth.js');
  const resetCode = await auth.generateOtp(phone, 'reset');
  const reset = await api('/api/auth/reset-password', { method: 'POST', body: { phone, code: resetCode, newPassword: 'NewPass!456' } });
  assert.equal(reset.status, 200);

  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'Strong!Pass123' } });
  assert.equal(oldLogin.status, 400);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'NewPass!456' } });
  assert.equal(newLogin.status, 200);
});

test('reset-password rejects a bad code', async () => {
  const phone = uniquePhone();
  const r = await api('/api/auth/reset-password', { method: 'POST', body: { phone, code: '999999', newPassword: 'NewPass!456' } });
  assert.equal(r.status, 400);
});

test('login with a personal PIN issues a challenge step', async () => {
  const u = await newUser('chef', 'Pin User');

  const setPin = await api('/api/me/pin', { method: 'POST', token: u.accessToken, body: { pin: '2468', currentPassword: 'Strong!Pass123' } });
  assert.equal(setPin.status, 200);

  const challenge = await api('/api/auth/login', { method: 'POST', body: { identifier: u.phone, password: 'Strong!Pass123' } });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.body.step, 'challenge');

  const withPin = await api('/api/auth/login', { method: 'POST', body: { identifier: u.phone, password: 'Strong!Pass123', pin: '2468' } });
  assert.equal(withPin.status, 200);
  assert.ok(withPin.body.accessToken);

  const wrongPin = await api('/api/auth/login', { method: 'POST', body: { identifier: u.phone, password: 'Strong!Pass123', pin: '9999' } });
  assert.equal(wrongPin.status, 400);
});

test('banned users cannot log in', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('banned');
  const s = await api('/api/auth/signup', { method: 'POST', body: { role: 'waiter', name: 'Banned', phone, email, password: 'Strong!Pass123' } });
  await api('/api/auth/verify', { method: 'POST', body: { phone, code: s.body.devCode } });

  const { db } = await import('../src/db.js');
  const user = await db.get(`SELECT * FROM users WHERE phone = $1`, phone);
  await db.run(`UPDATE users SET banned = 1 WHERE id = $1`, user.id);

  const r = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'Strong!Pass123' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /banned/i);
});
