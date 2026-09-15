import {
  test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, resetRateLimit,
} from './helpers.js';

test.before(async () => start());
test.after(async () => stop());

async function makeChef() {
  const phone = uniquePhone();
  const res = await signupAndVerify({
    role: 'chef', name: 'OTP Chef', phone, email: uniqueEmail('otpchef'),
    specialties: ['Tandoor'], yearsExperience: 2,
  });
  return { ...res, phone };
}

test('a registered number can request a code and sign in with it', async () => {
  await resetRateLimit();
  const { phone } = await makeChef();

  const req = await api('/api/auth/otp/request', { method: 'POST', body: { phone } });
  assert.equal(req.status, 200);
  assert.ok(req.body.devCode, 'the dev build returns the code so tests can use it');

  const verify = await api('/api/auth/otp/verify', {
    method: 'POST', body: { phone, code: req.body.devCode },
  });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.ok(verify.body.accessToken);
  assert.equal(verify.body.user.role, 'chef');

  // The issued token really works.
  const me = await api('/api/me', { token: verify.body.accessToken });
  assert.equal(me.status, 200);
});

test('an unregistered number gets an identical response and no code', async () => {
  await resetRateLimit();
  const r = await api('/api/auth/otp/request', {
    method: 'POST', body: { phone: '+91 90000 11111' },
  });
  assert.equal(r.status, 200, 'must not 404 — that would leak which numbers exist');
  assert.equal(r.body.devCode, undefined, 'no code for an unknown number');
  assert.ok(r.body.message);
});

test('a wrong code is rejected', async () => {
  await resetRateLimit();
  const { phone } = await makeChef();
  await api('/api/auth/otp/request', { method: 'POST', body: { phone } });

  const r = await api('/api/auth/otp/verify', {
    method: 'POST', body: { phone, code: '000000' },
  });
  assert.equal(r.status, 400);
  assert.ok(!r.body.accessToken);
});

test('a code cannot be replayed once it has been used', async () => {
  await resetRateLimit();
  const { phone } = await makeChef();
  const req = await api('/api/auth/otp/request', { method: 'POST', body: { phone } });
  const code = req.body.devCode;

  const first = await api('/api/auth/otp/verify', { method: 'POST', body: { phone, code } });
  assert.equal(first.status, 200);

  const second = await api('/api/auth/otp/verify', { method: 'POST', body: { phone, code } });
  assert.equal(second.status, 400, 'a used code must not work twice');
});

test('a malformed code never reaches the verifier', async () => {
  await resetRateLimit();
  const { phone } = await makeChef();
  for (const code of ['', '12', 'abcdef', '1234567']) {
    const r = await api('/api/auth/otp/verify', { method: 'POST', body: { phone, code } });
    assert.equal(r.status, 400, `code ${JSON.stringify(code)} should be rejected`);
  }
});

test('admins cannot bypass 2FA through the OTP login path', async () => {
  await resetRateLimit();
  // The seeded super admin has a phone number; requesting a code for it must
  // never yield a usable session on the public endpoint.
  const r = await api('/api/auth/otp/request', {
    method: 'POST', body: { phone: '+91 99990 00004' },
  });
  assert.equal(r.status, 200);
  if (r.body.devCode) {
    const v = await api('/api/auth/otp/verify', {
      method: 'POST', body: { phone: '+91 99990 00004', code: r.body.devCode },
    });
    assert.notEqual(v.status, 200, 'an admin must not get tokens from OTP login');
  }
});
