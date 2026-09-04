import { test, assert, api, start, stop, uniquePhone, uniqueEmail, newUser, signupAndVerify } from './helpers.js';

const { totp } = await import('../src/security.js');

test.before(async () => start());
test.after(async () => stop());

test('GET /api/me requires a valid token', async () => {
  const noAuth = await api('/api/me');
  assert.equal(noAuth.status, 401);
  const badToken = await api('/api/me', { token: 'garbage.token.here' });
  assert.equal(badToken.status, 401);
});

test('GET /api/me returns role-specific profile data', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail('mgr');
  const res = await signupAndVerify({ role: 'manager', name: 'Profile Mgr', phone, email, businessName: 'My Kitchen', businessType: 'restaurant', businessAddress: 'Main St' });
  const r = await api('/api/me', { token: res.accessToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.businessName, 'My Kitchen');
  assert.equal(r.body.user.businessType, 'restaurant');
  assert.ok(Array.isArray(r.body.specialties));
  assert.equal(r.body.user.stats.completed, 0);
  assert.ok('rating' in r.body.user);
});

test('GET /api/me returns chef specialties and worker stats', async () => {
  const res = await signupAndVerify({ role: 'chef', name: 'Profile Chef', phone: uniquePhone(), email: uniqueEmail('chef'), specialties: ['Tandoor', 'BBQ/Grill'], yearsExperience: 6 });
  const r = await api('/api/me', { token: res.accessToken });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user.specialties, ['Tandoor', 'BBQ/Grill']);
  assert.equal(r.body.user.yearsExperience, 6);
});

test('PUT /api/me updates name and role-specific fields', async () => {
  const res = await signupAndVerify({ role: 'manager', name: 'Old Name', phone: uniquePhone(), email: uniqueEmail('put'), businessName: 'Old Biz', businessType: 'cafe', businessAddress: 'Old St' });

  const r = await api('/api/me', { method: 'PUT', token: res.accessToken, body: { name: 'New Name', businessName: 'New Biz', businessType: 'restaurant', businessAddress: 'New St' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'New Name');
  assert.equal(r.body.user.businessName, 'New Biz');
  assert.equal(r.body.user.businessType, 'restaurant');
});

test('PUT /api/me filters chef specialties to the allowed list', async () => {
  const res = await signupAndVerify({ role: 'chef', name: 'Specialty Chef', phone: uniquePhone(), email: uniqueEmail('spec'), specialties: ['Tandoor'] });
  const r = await api('/api/me', { method: 'PUT', token: res.accessToken, body: { specialties: ['Tandoor', 'NOT A SPECIALTY', 'Italian'], yearsExperience: 10 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user.specialties, ['Tandoor', 'Italian']);
  assert.equal(r.body.user.yearsExperience, 10);
});

test('POST /api/me/password changes password and revokes sessions', async () => {
  const res = await newUser('waiter', 'Pw User');
  const wrong = await api('/api/me/password', { method: 'POST', token: res.accessToken, body: { currentPassword: 'nope', newPassword: 'Brand!New99' } });
  assert.equal(wrong.status, 400);

  const ok = await api('/api/me/password', { method: 'POST', token: res.accessToken, body: { currentPassword: 'Strong!Pass123', newPassword: 'Brand!New99' } });
  assert.equal(ok.status, 200);

  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: res.phone, password: 'Strong!Pass123' } });
  assert.equal(oldLogin.status, 400);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: res.phone, password: 'Brand!New99' } });
  assert.equal(newLogin.status, 200);
});

test('availability is restricted to workers', async () => {
  const chef = await newUser('chef', 'Avail Chef');
  const r = await api('/api/me/availability', { method: 'POST', token: chef.accessToken, body: { available: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.available, true);
  const r2 = await api('/api/me/availability', { method: 'POST', token: chef.accessToken, body: { available: false } });
  assert.equal(r2.body.available, false);

  const mgr = await newUser('manager', 'Avail Mgr');
  const r3 = await api('/api/me/availability', { method: 'POST', token: mgr.accessToken, body: { available: true } });
  assert.equal(r3.status, 403);
});

test('PIN set/clear lifecycle', async () => {
  const res = await newUser('waiter', 'Pin Mgr');
  const invalid = await api('/api/me/pin', { method: 'POST', token: res.accessToken, body: { pin: '12!', currentPassword: 'Strong!Pass123' } });
  assert.equal(invalid.status, 400);

  const ok = await api('/api/me/pin', { method: 'POST', token: res.accessToken, body: { pin: '1357', currentPassword: 'Strong!Pass123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.pinEnabled, true);

  const cleared = await api('/api/me/pin/clear', { method: 'POST', token: res.accessToken, body: { currentPassword: 'Strong!Pass123' } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.user.pinEnabled, false);
});

test('email update validates and rejects duplicates', async () => {
  const a = await newUser('waiter', 'Email A');
  const b = await newUser('chef', 'Email B');

  const invalid = await api('/api/me/email', { method: 'POST', token: a.accessToken, body: { email: 'nope', currentPassword: 'Strong!Pass123' } });
  assert.equal(invalid.status, 400);

  const dup = await api('/api/me/email', { method: 'POST', token: a.accessToken, body: { email: b.email, currentPassword: 'Strong!Pass123' } });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /already used/i);

  const fresh = uniqueEmail('emailupd');
  const ok = await api('/api/me/email', { method: 'POST', token: a.accessToken, body: { email: fresh, currentPassword: 'Strong!Pass123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, fresh);
});

test('phone change request + confirm with OTP', async () => {
  const res = await newUser('waiter', 'Phone Mgr');
  const newPhone = uniquePhone();

  const req = await api('/api/me/phone/request', { method: 'POST', token: res.accessToken, body: { newPhone, currentPassword: 'Strong!Pass123' } });
  assert.equal(req.status, 200);
  assert.ok(req.body.devCode);

  const confirm = await api('/api/me/phone/confirm', { method: 'POST', token: res.accessToken, body: { newPhone, code: req.body.devCode } });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.user.phone, newPhone);
});

test('TOTP setup -> confirm -> login challenge -> disable', async () => {
  const res = await newUser('chef', 'Totp Chef');

  const setup = await api('/api/me/totp/setup', { method: 'POST', token: res.accessToken, body: { currentPassword: 'Strong!Pass123' } });
  assert.equal(setup.status, 200);
  assert.ok(setup.body.secret);
  assert.match(setup.body.otpauth, /otpauth:\/\/totp\//);

  const code = totp(setup.body.secret);
  const confirm = await api('/api/me/totp/confirm', { method: 'POST', token: res.accessToken, body: { code } });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.user.totpEnabled, true);

  // Logging in now demands the authenticator code.
  const challenge = await api('/api/auth/login', { method: 'POST', body: { identifier: res.phone, password: 'Strong!Pass123' } });
  assert.equal(challenge.body.step, 'challenge');
  const denied = await api('/api/auth/login', { method: 'POST', body: { identifier: res.phone, password: 'Strong!Pass123', code: '000000' } });
  assert.equal(denied.status, 400);
  const granted = await api('/api/auth/login', { method: 'POST', body: { identifier: res.phone, password: 'Strong!Pass123', code: totp(setup.body.secret) } });
  assert.equal(granted.status, 200);

  // Confirm needs the code; a wrong one is rejected.
  const badDisable = await api('/api/me/totp/disable', { method: 'POST', token: res.accessToken, body: { currentPassword: 'Strong!Pass123', code: '000000' } });
  assert.equal(badDisable.status, 400);
  const disable = await api('/api/me/totp/disable', { method: 'POST', token: res.accessToken, body: { currentPassword: 'Strong!Pass123', code: totp(setup.body.secret) } });
  assert.equal(disable.status, 200);
  assert.equal(disable.body.user.totpEnabled, false);
});

test('sessions list and revoke', async () => {
  const res = await newUser('waiter', 'Session User');
  const sessions = await api('/api/me/sessions', { token: res.accessToken });
  assert.equal(sessions.status, 200);
  assert.ok(Array.isArray(sessions.body.sessions));
  assert.equal(sessions.body.sessions.length, 1);

  const revoked = await api(`/api/me/sessions/${sessions.body.sessions[0].id}`, { method: 'DELETE', token: res.accessToken });
  assert.equal(revoked.status, 200);

  const after = await api('/api/me/sessions', { token: res.accessToken });
  assert.equal(after.body.sessions.length, 0);
});

test('notifications list and mark-as-read', async () => {
  const res = await newUser('waiter', 'Ntf User');
  const { db } = await import('../src/db.js');
  const { uid, nowIso } = await import('../src/config.js');
  const n1 = uid('ntf');
  const n2 = uid('ntf');
  await db.run(`INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1,$2,$3,$4,$5,0,$6)`,
    n1, res.userId, 'Hello', 'World', 'test', nowIso());
  await db.run(`INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1,$2,$3,$4,$5,0,$6)`,
    n2, res.userId, 'Second', 'Notice', 'test', nowIso());

  const list = await api('/api/me/notifications', { token: res.accessToken });
  assert.equal(list.status, 200);
  assert.equal(list.body.notifications.length, 2);
  const titles = list.body.notifications.map((n) => n.title);
  assert.ok(titles.includes('Hello'));
  assert.ok(titles.includes('Second'));
  assert.equal(list.body.notifications.find((x) => x.id === n1).read, false);
  assert.equal(list.body.notifications.find((x) => x.id === n2).read, false);

  const read = await api('/api/me/notifications/read', { method: 'POST', token: res.accessToken, body: { ids: [n1] } });
  assert.equal(read.status, 200);

  const after = await api('/api/me/notifications', { token: res.accessToken });
  assert.equal(after.body.notifications.find((x) => x.id === n1).read, true);
  assert.equal(after.body.notifications.find((x) => x.id === n2).read, false);
});

test('push subscribe stores the device and vapid is exposed', async () => {
  const res = await newUser('chef', 'Push Chef');
  const sub = { endpoint: 'https://push.example.com/xyz', keys: { p256dh: 'abc', auth: 'def' } };
  const r = await api('/api/me/push-subscribe', { method: 'POST', token: res.accessToken, body: { subscription: sub } });
  assert.equal(r.status, 200);

  const bad = await api('/api/me/push-subscribe', { method: 'POST', token: res.accessToken, body: { subscription: {} } });
  assert.equal(bad.status, 400);

  const vapid = await api('/api/me/vapid');
  assert.equal(vapid.status, 200);
  assert.ok(vapid.body.publicKey);
});

test('delete-account removes the user', async () => {
  const res = await newUser('waiter', 'Delete Me');
  const wrong = await api('/api/me/delete-account', { method: 'POST', token: res.accessToken, body: { password: 'nope' } });
  assert.equal(wrong.status, 400);

  const ok = await api('/api/me/delete-account', { method: 'POST', token: res.accessToken, body: { password: 'Strong!Pass123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);

  const login = await api('/api/auth/login', { method: 'POST', body: { identifier: res.phone, password: 'Strong!Pass123' } });
  assert.equal(login.status, 400);
});
