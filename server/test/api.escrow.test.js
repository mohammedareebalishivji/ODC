import {
  test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, futureDate,
} from './helpers.js';

test.before(async () => start());
test.after(async () => stop());

async function makeManager(name = 'Escrow Mgr') {
  return signupAndVerify({
    role: 'manager', name, phone: uniquePhone(), email: uniqueEmail('emgr'),
    businessName: 'Escrow Bistro', businessType: 'restaurant', businessAddress: 'Andheri',
  });
}

async function makeChef(name = 'Escrow Chef') {
  return signupAndVerify({
    role: 'chef', name, phone: uniquePhone(), email: uniqueEmail('echef'),
    specialties: ['Tandoor'], yearsExperience: 4,
  });
}

/** Post a shift, have the chef accept, and the manager lock them in. */
async function matchedShift({ pay = 1000 } = {}) {
  const mgr = await makeManager();
  const chef = await makeChef();

  const posted = await api('/api/shifts', {
    method: 'POST', token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960,
      locationName: 'Escrow Bistro', lat: 19.06, lng: 72.83, payMin: pay, payMax: pay,
    },
  });
  assert.equal(posted.status, 201);
  const shiftId = posted.body.shift.id;

  const responded = await api(`/api/shifts/${shiftId}/respond`, {
    method: 'POST', token: chef.accessToken, body: { kind: 'accept' },
  });
  assert.equal(responded.status, 201, JSON.stringify(responded.body));

  const list = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  const responseId = list.body.responses[0].id;

  const accepted = await api(`/api/shifts/${shiftId}/accept`, {
    method: 'POST', token: mgr.accessToken, body: { responseId },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  return { mgr, chef, shiftId };
}

test('matching a shift opens an escrow hold for the agreed amount', async () => {
  const { mgr, chef, shiftId } = await matchedShift({ pay: 1000 });

  const r = await api('/api/payments/escrow', { token: chef.accessToken });
  assert.equal(r.status, 200);

  const hold = r.body.holds.find((h) => h.shiftId === shiftId);
  assert.ok(hold, 'expected a hold for the matched shift');
  assert.equal(hold.status, 'held');
  assert.equal(hold.grossAmount, 1000);
  // Fee + worker share must always reconstitute the gross exactly.
  assert.equal(hold.feeAmount + hold.workerAmount, hold.grossAmount);

  // The manager sees the same hold from their side.
  const mgrView = await api('/api/payments/escrow', { token: mgr.accessToken });
  assert.ok(mgrView.body.holds.some((h) => h.id === hold.id));
});

test('money held in escrow is not spendable until released', async () => {
  const { chef } = await matchedShift({ pay: 800 });

  const summary = await api('/api/payments/summary', { token: chef.accessToken });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.available, 0, 'nothing is available before release');
  assert.ok(summary.body.inEscrow > 0, 'the shift value is sitting in escrow');
});

test('releasing a hold credits the worker and empties escrow', async () => {
  const { mgr, chef, shiftId } = await matchedShift({ pay: 1000 });

  const before = await api('/api/payments/escrow', { token: chef.accessToken });
  const hold = before.body.holds.find((h) => h.shiftId === shiftId);

  const released = await api(`/api/payments/escrow/${hold.id}/release`, {
    method: 'POST', token: mgr.accessToken,
  });
  assert.equal(released.status, 200, JSON.stringify(released.body));
  assert.equal(released.body.status, 'released');

  const summary = await api('/api/payments/summary', { token: chef.accessToken });
  assert.equal(summary.body.available, hold.workerAmount);
  assert.equal(summary.body.inEscrow, 0);

  const tx = await api('/api/payments/transactions', { token: chef.accessToken });
  assert.equal(tx.body.transactions.length, 1);
  assert.equal(tx.body.transactions[0].kind, 'earning');
  assert.equal(tx.body.transactions[0].amount, hold.workerAmount);
});

test('a hold can only be released by the manager who owns it', async () => {
  const { chef, shiftId } = await matchedShift();
  const stranger = await makeManager('Nosy Mgr');

  const holds = await api('/api/payments/escrow', { token: chef.accessToken });
  const hold = holds.body.holds.find((h) => h.shiftId === shiftId);

  const r = await api(`/api/payments/escrow/${hold.id}/release`, {
    method: 'POST', token: stranger.accessToken,
  });
  assert.equal(r.status, 403);

  // The worker cannot self-release either.
  const byWorker = await api(`/api/payments/escrow/${hold.id}/release`, {
    method: 'POST', token: chef.accessToken,
  });
  assert.ok(byWorker.status === 403 || byWorker.status === 401);
});

test('releasing twice is idempotent and does not double-pay', async () => {
  const { mgr, chef, shiftId } = await matchedShift({ pay: 600 });
  const holds = await api('/api/payments/escrow', { token: chef.accessToken });
  const hold = holds.body.holds.find((h) => h.shiftId === shiftId);

  await api(`/api/payments/escrow/${hold.id}/release`, { method: 'POST', token: mgr.accessToken });
  await api(`/api/payments/escrow/${hold.id}/release`, { method: 'POST', token: mgr.accessToken });

  const summary = await api('/api/payments/summary', { token: chef.accessToken });
  assert.equal(summary.body.available, hold.workerAmount, 'worker paid exactly once');

  const tx = await api('/api/payments/transactions', { token: chef.accessToken });
  assert.equal(tx.body.transactions.length, 1, 'only one ledger entry written');
});

test('withdrawal debits the ledger and cannot overdraw', async () => {
  const { mgr, chef, shiftId } = await matchedShift({ pay: 1000 });
  const holds = await api('/api/payments/escrow', { token: chef.accessToken });
  const hold = holds.body.holds.find((h) => h.shiftId === shiftId);
  await api(`/api/payments/escrow/${hold.id}/release`, { method: 'POST', token: mgr.accessToken });

  const method = await api('/api/payments/methods', {
    method: 'POST', token: chef.accessToken, body: { kind: 'upi', upiId: 'chef@okaxis' },
  });
  assert.equal(method.status, 201, JSON.stringify(method.body));

  const tooMuch = await api('/api/payments/withdraw', {
    method: 'POST', token: chef.accessToken,
    body: { amount: hold.workerAmount + 1, methodId: method.body.id },
  });
  assert.equal(tooMuch.status, 400, 'overdraft must be rejected');

  const ok = await api('/api/payments/withdraw', {
    method: 'POST', token: chef.accessToken,
    body: { amount: 100, methodId: method.body.id },
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));

  const summary = await api('/api/payments/summary', { token: chef.accessToken });
  assert.equal(summary.body.available, Math.round((hold.workerAmount - 100) * 100) / 100);
});

test('payout methods reject malformed UPI and IFSC input', async () => {
  const chef = await makeChef('Picky Chef');

  const badUpi = await api('/api/payments/methods', {
    method: 'POST', token: chef.accessToken, body: { kind: 'upi', upiId: 'not-a-upi' },
  });
  assert.equal(badUpi.status, 400);

  const badIfsc = await api('/api/payments/methods', {
    method: 'POST', token: chef.accessToken,
    body: { kind: 'bank', accountNumber: '123456789012', ifsc: 'nope' },
  });
  assert.equal(badIfsc.status, 400);
});

test('a bank payout method stores only the last four digits', async () => {
  const chef = await makeChef('Bank Chef');
  const r = await api('/api/payments/methods', {
    method: 'POST', token: chef.accessToken,
    body: { kind: 'bank', accountNumber: '123456789012', ifsc: 'HDFC0001234' },
  });
  assert.equal(r.status, 201);

  const summary = await api('/api/payments/summary', { token: chef.accessToken });
  const saved = summary.body.methods.find((m) => m.id === r.body.id);
  assert.equal(saved.accountLast4, '9012');
  // The full account number must not come back anywhere in the payload.
  assert.ok(!JSON.stringify(summary.body).includes('123456789012'));
});

test('payments endpoints require authentication', async () => {
  for (const path of ['/api/payments/summary', '/api/payments/transactions', '/api/payments/escrow']) {
    const r = await api(path);
    assert.equal(r.status, 401, `${path} should be guarded`);
  }
});
