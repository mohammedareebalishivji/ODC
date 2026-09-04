import { test, assert } from './helpers.js';

const { signJwt, verifyJwt, hashToken, randomToken, totp, verifyTotp, generateTotpSecret } = await import('../src/security.js');

test('signJwt/verifyJwt round-trip carries payload and TTL', () => {
  const token = signJwt({ sub: 'usr_1', role: 'chef' }, 3600);
  const payload = verifyJwt(token);
  assert.ok(payload);
  assert.equal(payload.sub, 'usr_1');
  assert.equal(payload.role, 'chef');
  assert.ok(payload.exp > payload.iat);
});

test('verifyJwt rejects tampered tokens', () => {
  const token = signJwt({ sub: 'usr_1' }, 3600);
  const tampered = token.slice(0, -3) + 'xxx';
  assert.equal(verifyJwt(tampered), null);
});

test('verifyJwt rejects garbage / malformed input', () => {
  assert.equal(verifyJwt(''), null);
  assert.equal(verifyJwt('a.b'), null);
  assert.equal(verifyJwt('not a token at all'), null);
});

test('verifyJwt rejects expired tokens', () => {
  const token = signJwt({ sub: 'usr_1' }, -10);
  assert.equal(verifyJwt(token), null);
});

test('hashToken is deterministic hex', () => {
  const a = hashToken('secret-value');
  assert.equal(a, hashToken('secret-value'));
  assert.notEqual(a, hashToken('other-value'));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('randomToken produces unique urlsafe strings', () => {
  const a = randomToken();
  const b = randomToken();
  assert.equal(a.length, 43);
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('totp produces a 6-digit code and verifyTotp accepts it', () => {
  const secret = generateTotpSecret();
  const code = totp(secret);
  assert.match(code, /^\d{6}$/);
  assert.ok(verifyTotp(secret, code));
});

test('verifyTotp rejects wrong codes and rejects malformed codes', () => {
  const secret = generateTotpSecret();
  const code = totp(secret);
  assert.equal(code === '000000' ? verifyTotp(secret, '123456') : verifyTotp(secret, '000000'), false);
  assert.ok(!verifyTotp(secret, '12a45'));
  assert.ok(!verifyTotp(secret, ''));
});

test('generateTotpSecret returns a base64 secret', () => {
  const s = generateTotpSecret();
  assert.ok(typeof s === 'string' && s.length >= 20);
});
