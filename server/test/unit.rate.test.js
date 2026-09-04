import { test, assert } from './helpers.js';
import { rateLimit, loginLimiter } from '../src/rate.js';

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('rateLimit allows requests under the cap', () => {
  const req = { path: '/x', ip: '1.1.1.1' };
  const res = fakeResponse();
  const mw = rateLimit({ max: 3 });
  let passed = 0;
  for (let i = 0; i < 3; i++) mw(req, res, () => passed++);
  assert.equal(passed, 3);
  assert.equal(res.statusCode, 200);
});

test('rateLimit blocks requests over the cap', () => {
  const req = { path: '/y', ip: '2.2.2.2' };
  const res = fakeResponse();
  const mw = rateLimit({ max: 2 });
  let passed = 0;
  mw(req, res, () => passed++);
  mw(req, res, () => passed++);
  mw(req, res, () => passed++);
  assert.equal(passed, 2);
  assert.equal(res.statusCode, 429);
  assert.match(res.body.error, /Too many/i);
});

test('rateLimit enforces lockout after cap is crossed', () => {
  const req = { path: '/z', ip: '3.3.3.3' };
  const mw = rateLimit({ max: 1, lockoutMs: 60_000 });
  const res = fakeResponse();
  mw(req, res, () => {});
  const res2 = fakeResponse();
  mw(req, res2, () => {});
  const res3 = fakeResponse();
  mw(req, res3, () => {});
  assert.equal(res2.statusCode, 429);
  assert.equal(res3.statusCode, 429);
});

test('rateLimit buckets are keyed separately per request path', () => {
  const mw = rateLimit({ max: 1 });
  const resA = fakeResponse();
  const resB = fakeResponse();
  mw({ path: '/a', ip: '4.4.4.4' }, resA, () => {});
  mw({ path: '/b', ip: '4.4.4.4' }, resB, () => {});
  assert.equal(resA.statusCode, 200);
  assert.equal(resB.statusCode, 200);
});

test('loginLimiter derives its key from the callback', () => {
  const mw = loginLimiter((req) => req.user);
  const req = { path: '/login', ip: '5.5.5.5', user: 'alice' };
  const res = fakeResponse();
  let passed = 0;
  for (let i = 0; i < 8; i++) mw(req, res, () => passed++);
  assert.equal(passed, 8);
  const res2 = fakeResponse();
  mw(req, res2, () => passed++);
  assert.equal(res2.statusCode, 429);
});
