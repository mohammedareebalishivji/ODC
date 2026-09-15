import {
  test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, futureDate,
} from './helpers.js';

test.before(async () => start());
test.after(async () => stop());

async function matchedShift({ pay = 1200 } = {}) {
  const mgr = await signupAndVerify({
    role: 'manager', name: 'Life Mgr', phone: uniquePhone(), email: uniqueEmail('lmgr'),
    businessName: 'Lifecycle Grill', businessType: 'restaurant', businessAddress: 'Colaba',
  });
  const chef = await signupAndVerify({
    role: 'chef', name: 'Life Chef', phone: uniquePhone(), email: uniqueEmail('lchef'),
    specialties: ['Tandoor'], yearsExperience: 3,
  });

  const posted = await api('/api/shifts', {
    method: 'POST', token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(1), startMin: 600, endMin: 900,
      locationName: 'Lifecycle Grill', lat: 18.9, lng: 72.8, payMin: pay, payMax: pay,
    },
  });
  const shiftId = posted.body.shift.id;
  await api(`/api/shifts/${shiftId}/respond`, {
    method: 'POST', token: chef.accessToken, body: { kind: 'accept' },
  });
  const detail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  await api(`/api/shifts/${shiftId}/accept`, {
    method: 'POST', token: mgr.accessToken, body: { responseId: detail.body.responses[0].id },
  });
  return { mgr, chef, shiftId };
}

test('a confirmed shift exposes a reference and a shared arrival code', async () => {
  const { mgr, chef, shiftId } = await matchedShift();

  const asChef = await api(`/api/shifts/${shiftId}`, { token: chef.accessToken });
  const asMgr = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });

  assert.match(asChef.body.shift.referenceCode, /^ODC-[0-9A-F]{4}-[0-9A-F]{2}$/);
  assert.match(asChef.body.shift.proximityCode, /^\d{4}$/);
  // Both sides must see the same code or check-in cannot be verified in person.
  assert.equal(asChef.body.shift.proximityCode, asMgr.body.shift.proximityCode);
});

test('the worker checks in with the arrival code', async () => {
  const { chef, shiftId } = await matchedShift();
  const detail = await api(`/api/shifts/${shiftId}`, { token: chef.accessToken });
  const code = detail.body.shift.proximityCode;

  const wrong = await api(`/api/shifts/${shiftId}/checkin`, {
    method: 'POST', token: chef.accessToken, body: { code: '0000' === code ? '1111' : '0000' },
  });
  assert.equal(wrong.status, 400, 'a wrong code must be rejected');

  const ok = await api(`/api/shifts/${shiftId}/checkin`, {
    method: 'POST', token: chef.accessToken, body: { code },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.checkedInAt);

  const after = await api(`/api/shifts/${shiftId}`, { token: chef.accessToken });
  assert.ok(after.body.shift.checkedInAt);
});

test('only the matched worker can check in', async () => {
  const { mgr, shiftId } = await matchedShift();
  const detail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  const outsider = await signupAndVerify({
    role: 'chef', name: 'Outside Chef', phone: uniquePhone(), email: uniqueEmail('ochef2'),
    specialties: ['Tandoor'], yearsExperience: 1,
  });

  const r = await api(`/api/shifts/${shiftId}/checkin`, {
    method: 'POST', token: outsider.accessToken,
    body: { code: detail.body.shift.proximityCode },
  });
  assert.equal(r.status, 403);
});

test('a shift cannot be completed before the worker checks in', async () => {
  const { mgr, shiftId } = await matchedShift();
  const early = await api(`/api/shifts/${shiftId}/complete`, { method: 'POST', token: mgr.accessToken });
  assert.equal(early.status, 400);
});

test('the venue completes the shift after check-in, and only its own', async () => {
  const { mgr, chef, shiftId } = await matchedShift();
  const detail = await api(`/api/shifts/${shiftId}`, { token: chef.accessToken });
  await api(`/api/shifts/${shiftId}/checkin`, {
    method: 'POST', token: chef.accessToken, body: { code: detail.body.shift.proximityCode },
  });

  const stranger = await signupAndVerify({
    role: 'manager', name: 'Other Mgr', phone: uniquePhone(), email: uniqueEmail('omgr2'),
    businessName: 'Elsewhere', businessType: 'restaurant', businessAddress: 'Worli',
  });
  const forbidden = await api(`/api/shifts/${shiftId}/complete`, {
    method: 'POST', token: stranger.accessToken,
  });
  assert.equal(forbidden.status, 403);

  const ok = await api(`/api/shifts/${shiftId}/complete`, { method: 'POST', token: mgr.accessToken });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.completedAt);
});

test('the treasury terminal reconciles against the escrow ledger', async () => {
  const { mgr, chef, shiftId } = await matchedShift({ pay: 1000 });

  const adminLogin = await api('/tail/z7k9x2/admin/login', {
    method: 'POST',
    body: { email: 'testsuperadmin@odc.in', password: 'Test@1234', code: '000000' },
  });
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));
  const at = adminLogin.body.accessToken;

  const before = await api('/tail/z7k9x2/admin/treasury', { token: at });
  assert.equal(before.status, 200);
  const heldBefore = before.body.totals.held;

  // Release this shift and confirm the held total drops by exactly its net.
  const holds = await api('/api/payments/escrow', { token: chef.accessToken });
  const hold = holds.body.holds.find((h) => h.shiftId === shiftId);
  await api(`/api/payments/escrow/${hold.id}/release`, { method: 'POST', token: mgr.accessToken });

  const after = await api('/tail/z7k9x2/admin/treasury', { token: at });
  assert.equal(
    Math.round((heldBefore - after.body.totals.held) * 100) / 100,
    hold.workerAmount,
    'held total must fall by the released amount'
  );
  assert.ok(after.body.totals.fees >= hold.feeAmount, 'the fee is booked once released');
});

test('the treasury terminal is closed to non-admins', async () => {
  const { mgr } = await matchedShift();
  const r = await api('/tail/z7k9x2/admin/treasury', { token: mgr.accessToken });
  assert.notEqual(r.status, 200);
});
