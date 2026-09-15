import {
  test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, futureDate,
} from './helpers.js';

test.before(async () => start());
test.after(async () => stop());

async function makeManager(name = 'Ops Mgr') {
  return signupAndVerify({
    role: 'manager', name, phone: uniquePhone(), email: uniqueEmail('omgr'),
    businessName: 'Ops Grill', businessType: 'restaurant', businessAddress: 'Powai',
  });
}

async function makeChef(name = 'Ops Chef') {
  return signupAndVerify({
    role: 'chef', name, phone: uniquePhone(), email: uniqueEmail('ochef'),
    specialties: ['Tandoor'], yearsExperience: 3,
  });
}

async function matchedShift({ pay = 900 } = {}) {
  const mgr = await makeManager();
  const chef = await makeChef();
  const posted = await api('/api/shifts', {
    method: 'POST', token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960,
      locationName: 'Ops Grill', lat: 19.1, lng: 72.9, payMin: pay, payMax: pay,
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

/* --------------------------- ShiftConnect chat --------------------------- */

test('the two parties to a shift can open a thread and exchange messages', async () => {
  const { mgr, chef, shiftId } = await matchedShift();

  const conv = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });
  assert.equal(conv.status, 200, JSON.stringify(conv.body));

  const sent = await api(`/api/chat/${conv.body.id}/messages`, {
    method: 'POST', token: mgr.accessToken, body: { body: 'Please use the staff entrance.' },
  });
  assert.equal(sent.status, 201);

  const asChef = await api(`/api/chat/${conv.body.id}/messages`, { token: chef.accessToken });
  assert.equal(asChef.status, 200);
  assert.equal(asChef.body.messages.length, 1);
  assert.equal(asChef.body.messages[0].body, 'Please use the staff entrance.');
  assert.equal(asChef.body.messages[0].mine, false, 'authored by the manager');
});

test('the conversation list shows the thread, its last message and unread count', async () => {
  const { mgr, chef, shiftId } = await matchedShift();
  const conv = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });
  await api(`/api/chat/${conv.body.id}/messages`, {
    method: 'POST', token: mgr.accessToken, body: { body: 'Bring your own knife roll.' },
  });

  const list = await api('/api/chat', { token: chef.accessToken });
  assert.equal(list.status, 200, JSON.stringify(list.body));

  const row = list.body.conversations.find((c) => c.id === conv.body.id);
  assert.ok(row, 'the worker should see the thread in their list');
  assert.equal(row.lastMessage, 'Bring your own knife roll.');
  assert.equal(row.unread, 1, 'one message the worker has not read');

  // Reading the thread clears the unread badge.
  await api(`/api/chat/${conv.body.id}/messages`, { token: chef.accessToken });
  const after = await api('/api/chat', { token: chef.accessToken });
  assert.equal(after.body.conversations.find((c) => c.id === conv.body.id).unread, 0);
});

test('opening the same shift thread twice reuses one conversation', async () => {
  const { mgr, shiftId } = await matchedShift();
  const a = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });
  const b = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });
  assert.equal(a.body.id, b.body.id);
});

test('an outsider cannot read or post to a thread', async () => {
  const { mgr, shiftId } = await matchedShift();
  const outsider = await makeChef('Nosy Chef');
  const conv = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });

  const read = await api(`/api/chat/${conv.body.id}/messages`, { token: outsider.accessToken });
  assert.equal(read.status, 403);

  const write = await api(`/api/chat/${conv.body.id}/messages`, {
    method: 'POST', token: outsider.accessToken, body: { body: 'let me in' },
  });
  assert.equal(write.status, 403);
});

test('an empty message is rejected', async () => {
  const { mgr, shiftId } = await matchedShift();
  const conv = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });
  const r = await api(`/api/chat/${conv.body.id}/messages`, {
    method: 'POST', token: mgr.accessToken, body: { body: '   ' },
  });
  assert.equal(r.status, 400);
});

/* ------------------------------- Disputes ------------------------------- */

test('raising a dispute freezes the escrow hold', async () => {
  const { mgr, chef, shiftId } = await matchedShift();

  const raised = await api('/api/disputes', {
    method: 'POST', token: chef.accessToken,
    body: { shiftId, reason: 'underpaid', detail: 'Agreed rate was higher.' },
  });
  assert.equal(raised.status, 201, JSON.stringify(raised.body));

  const holds = await api('/api/payments/escrow', { token: chef.accessToken });
  const hold = holds.body.holds.find((h) => h.shiftId === shiftId);
  assert.equal(hold.status, 'disputed');

  // While frozen, the manager must not be able to release it unilaterally.
  const release = await api(`/api/payments/escrow/${hold.id}/release`, {
    method: 'POST', token: mgr.accessToken,
  });
  assert.equal(release.status, 409);
});

test('only one open dispute is allowed per shift', async () => {
  const { chef, shiftId } = await matchedShift();
  await api('/api/disputes', {
    method: 'POST', token: chef.accessToken, body: { shiftId, reason: 'late' },
  });
  const second = await api('/api/disputes', {
    method: 'POST', token: chef.accessToken, body: { shiftId, reason: 'quality' },
  });
  assert.equal(second.status, 409);
});

test('a stranger cannot raise a dispute on someone else\'s shift', async () => {
  const { shiftId } = await matchedShift();
  const outsider = await makeChef('Meddling Chef');
  const r = await api('/api/disputes', {
    method: 'POST', token: outsider.accessToken, body: { shiftId, reason: 'quality' },
  });
  assert.equal(r.status, 403);
});

test('an invalid dispute reason is rejected', async () => {
  const { chef, shiftId } = await matchedShift();
  const r = await api('/api/disputes', {
    method: 'POST', token: chef.accessToken, body: { shiftId, reason: 'because' },
  });
  assert.equal(r.status, 400);
});

test('dispute endpoints require authentication', async () => {
  const r = await api('/api/disputes');
  assert.equal(r.status, 401);
});

/* --------------------------------- KYC --------------------------------- */

test('a worker can submit Aadhaar and only the last four digits are kept', async () => {
  const chef = await makeChef('KYC Chef');
  const r = await api('/api/kyc', {
    method: 'POST', token: chef.accessToken,
    body: { docType: 'aadhaar', number: '123456789012' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));

  const list = await api('/api/kyc', { token: chef.accessToken });
  assert.equal(list.body.documents[0].numberLast4, '9012');
  assert.equal(list.body.documents[0].status, 'pending');
  // The full Aadhaar number must never be echoed back.
  assert.ok(!JSON.stringify(list.body).includes('123456789012'));
});

test('malformed Aadhaar and PAN values are rejected', async () => {
  const chef = await makeChef('Bad KYC Chef');

  const badAadhaar = await api('/api/kyc', {
    method: 'POST', token: chef.accessToken, body: { docType: 'aadhaar', number: '12345' },
  });
  assert.equal(badAadhaar.status, 400);

  const badPan = await api('/api/kyc', {
    method: 'POST', token: chef.accessToken, body: { docType: 'pan', number: 'XX1' },
  });
  assert.equal(badPan.status, 400);

  const badType = await api('/api/kyc', {
    method: 'POST', token: chef.accessToken, body: { docType: 'passport', number: 'A123' },
  });
  assert.equal(badType.status, 400);
});

test('an uploaded file must be an allowed media type', async () => {
  const chef = await makeChef('Upload Chef');
  const r = await api('/api/kyc', {
    method: 'POST', token: chef.accessToken,
    body: { docType: 'other', fileData: 'data:text/html;base64,PHNjcmlwdD4=' },
  });
  assert.equal(r.status, 400);
});

test('the KYC admin queue is closed to non-admins', async () => {
  const chef = await makeChef('Curious Chef');
  const r = await api('/api/kyc/admin/queue', { token: chef.accessToken });
  assert.equal(r.status, 403);
});
