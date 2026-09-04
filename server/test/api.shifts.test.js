import { test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, newUser, futureDate } from './helpers.js';

test.before(async () => start());
test.after(async () => stop());

async function makeManager(name = 'Shift Mgr') {
  const phone = uniquePhone();
  const email = uniqueEmail('smgr');
  const res = await signupAndVerify({ role: 'manager', name, phone, email, businessName: 'Tandoor House', businessType: 'restaurant', businessAddress: 'Bandra West' });
  return res;
}

async function makeChef(specialties = ['Tandoor', 'Continental'], name = 'Shift Chef') {
  const phone = uniquePhone();
  const email = uniqueEmail('schef');
  const res = await signupAndVerify({ role: 'chef', name, phone, email, specialties, yearsExperience: 5 });
  return res;
}

test('GET /api/shifts requires auth', async () => {
  const r = await api('/api/shifts/open');
  assert.equal(r.status, 401);
});

test('manager can post a shift', async () => {
  const mgr = await makeManager();
  const r = await api('/api/shifts', {
    method: 'POST',
    token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960,
      locationName: 'Tandoor House', lat: 19.06, lng: 72.83, payMin: 120, payMax: 150, notes: 'Friendly crew',
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.shift.role, 'chef');
  assert.equal(r.body.shift.specialty, 'Tandoor');
  assert.equal(r.body.shift.status, 'open');
  assert.equal(r.body.shift.payMin, 120);
  assert.equal(r.body.shift.viewerIsManager, true);
  assert.equal(r.body.shift.manager.name, 'Shift Mgr');
});

test('manager shift posting validates input', async () => {
  const mgr = await makeManager();
  const date = futureDate(2);

  // A valid waiter shift should post.
  const waiter = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'waiter', date, startMin: 600, endMin: 960, locationName: 'X', payMin: 80, payMax: 100 } });
  assert.equal(waiter.status, 201);

  const bad = [
    { role: 'plumber', date, startMin: 600, endMin: 960, locationName: 'X', payMin: 10, payMax: 20 },
    { role: 'chef', specialty: null, date, startMin: 600, endMin: 960, locationName: 'X', payMin: 10, payMax: 20 },
    { role: 'chef', specialty: 'Tandoor', date, startMin: 960, endMin: 600, locationName: 'X', payMin: 10, payMax: 20 },
    { role: 'chef', specialty: 'Tandoor', date, startMin: 600, endMin: 960, locationName: '', payMin: 10, payMax: 20 },
    { role: 'chef', specialty: 'Tandoor', date, startMin: 600, endMin: 960, locationName: 'X', payMin: 0, payMax: 20 },
    { role: 'chef', specialty: 'Tandoor', date, startMin: 600, endMin: 960, locationName: 'X', payMin: 100, payMax: 50 },
    { role: 'chef', specialty: 'Tandoor', date: '2020-01-01', startMin: 600, endMin: 960, locationName: 'X', payMin: 10, payMax: 20 },
  ];
  for (const b of bad) {
    const r = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: b });
    assert.equal(r.status, 400, JSON.stringify(b));
  }
});

test('non-managers cannot post shifts', async () => {
  const chef = await makeChef();
  const r = await api('/api/shifts', { method: 'POST', token: chef.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'X', payMin: 10, payMax: 20 } });
  assert.equal(r.status, 403);
});

test('open feed is filtered by role and specialty', async () => {
  const mgr = await makeManager('Feed Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'Feed Diner', payMin: 120, payMax: 150 } });
  const shiftId = posted.body.shift.id;

  const chef = await makeChef(['Tandoor']);
  const feed = await api('/api/shifts/open', { token: chef.accessToken });
  assert.equal(feed.status, 200);
  assert.ok(feed.body.shifts.some((s) => s.id === shiftId), 'Tandoor chef should see the Tandoor shift');

  const pastry = await makeChef(['Bakery/Pastry'], 'Pastry Chef');
  const feed2 = await api('/api/shifts/open', { token: pastry.accessToken });
  assert.ok(!feed2.body.shifts.some((s) => s.id === shiftId), 'pastry chef must not see a Tandoor shift');

  const waiter = await newUser('waiter', 'Feed Waiter');
  const feed3 = await api('/api/shifts/open', { token: waiter.accessToken });
  assert.ok(!feed3.body.shifts.some((s) => s.id === shiftId), 'waiter must not see a chef shift');
});

test('worker responds to a shift; duplicates are blocked', async () => {
  const mgr = await makeManager('Resp Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'Resp Diner', payMin: 120, payMax: 150 } });
  const shiftId = posted.body.shift.id;

  const chef = await makeChef(['Tandoor'], 'Resp Chef');
  const wrongSpec = await makeChef(['Bakery/Pastry'], 'Wrong Spec Chef');

  // Wrong specialty chef is rejected.
  const bad = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: wrongSpec.accessToken, body: { kind: 'accept' } });
  assert.equal(bad.status, 400);

  // Waiter cannot respond to a chef shift.
  const waiter = await newUser('waiter', 'Resp Waiter');
  const wrongRole = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: waiter.accessToken, body: { kind: 'accept' } });
  assert.equal(wrongRole.status, 400);

  const ok = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chef.accessToken, body: { kind: 'accept' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.response.kind, 'accept');
  assert.equal(ok.body.response.amount, 150);

  const dup = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chef.accessToken, body: { kind: 'accept' } });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /already responded/i);

  const gone = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: (await makeChef(['Tandoor'], 'Another Chef')).accessToken, body: { kind: 'accept' } });
  assert.equal(gone.status, 201);
});

test('counter offers must stay near the pay range', async () => {
  const mgr = await makeManager('Counter Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'Counter Diner', payMin: 100, payMax: 120 } });
  const shiftId = posted.body.shift.id;
  const chef = await makeChef(['Tandoor'], 'Counter Chef');

  const high = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chef.accessToken, body: { kind: 'counter', amount: 500 } });
  assert.equal(high.status, 400);

  const good = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chef.accessToken, body: { kind: 'counter', amount: 110 } });
  assert.equal(good.status, 201);
  assert.equal(good.body.response.kind, 'counter');
  assert.equal(good.body.response.amount, 110);
});

test('manager accepts a response and locks the shift', async () => {
  const mgr = await makeManager('Accept Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'Accept Diner', payMin: 100, payMax: 120 } });
  const shiftId = posted.body.shift.id;

  const chefA = await makeChef(['Tandoor'], 'Chef A');
  const chefB = await makeChef(['Tandoor'], 'Chef B');
  await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chefA.accessToken, body: { kind: 'accept' } });
  await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chefB.accessToken, body: { kind: 'counter', amount: 110 } });

  // Manager sees responses in /my.
  const my = await api('/api/shifts/my', { token: mgr.accessToken });
  assert.equal(my.status, 200);
  assert.equal(my.body.feeRate, 0.1);
  const mine = my.body.shifts.find((s) => s.id === shiftId);
  assert.ok(mine);
  assert.equal(mine.respCount, 2);

  // Detail shows responses only to the owning manager.
  const detail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  assert.equal(detail.body.responses.length, 2);

  const chefAView = await api(`/api/shifts/${shiftId}`, { token: chefA.accessToken });
  assert.equal(chefAView.body.responses.length, 0, 'workers must not see all responses');
  assert.ok(chefAView.body.myResponse);

  // Manager accepts chef A.
  const respId = detail.body.responses.find((r) => r.worker.name === 'Chef A').id;
  const accept = await api(`/api/shifts/${shiftId}/accept`, { method: 'POST', token: mgr.accessToken, body: { responseId: respId } });
  assert.equal(accept.status, 200);
  assert.equal(accept.body.shift.status, 'matched');
  assert.equal(accept.body.shift.worker.name, 'Chef A');
  assert.equal(accept.body.shift.agreedPay, 120);

  // Cannot accept again.
  const again = await api(`/api/shifts/${shiftId}/accept`, { method: 'POST', token: mgr.accessToken, body: { responseId: respId } });
  assert.equal(again.status, 400);

  // The other response was declined and the manager got a fee record.
  const { db } = await import('../src/db.js');
  const declined = await db.get(`SELECT status FROM responses WHERE worker_id = $1 AND shift_id = $2`, chefB.userId, shiftId);
  assert.equal(declined.status, 'declined');
  const fee = await db.get(`SELECT * FROM fee_records WHERE shift_id = $1`, shiftId);
  assert.ok(fee);
  assert.equal(fee.fee_amount, 12);
  assert.equal(fee.worker_payout, 108);

  // Worker feed shows the matched shift under /my with their response.
  const chefAMy = await api('/api/shifts/my', { token: chefA.accessToken });
  const mineA = chefAMy.body.shifts.find((s) => s.id === shiftId);
  assert.ok(mineA);
  assert.equal(mineA.status, 'matched');
  assert.equal(mineA.myResponse.status, 'accepted');
});

test('workers cannot accept responses', async () => {
  const mgr = await makeManager('NoAccept Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'NoAccept Diner', payMin: 100, payMax: 120 } });
  const shiftId = posted.body.shift.id;
  const chef = await makeChef(['Tandoor'], 'NoAccept Chef');
  const r = await api(`/api/shifts/${shiftId}/accept`, { method: 'POST', token: chef.accessToken, body: { responseId: 'anything' } });
  assert.equal(r.status, 403);
});

test('rating flows for matched shifts', async () => {
  const mgr = await makeManager('Rate Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'Rate Diner', payMin: 100, payMax: 120 } });
  const shiftId = posted.body.shift.id;
  const chef = await makeChef(['Tandoor'], 'Rate Chef');
  const resp = await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chef.accessToken, body: { kind: 'accept' } });

  // Cannot rate an unconfirmed shift.
  const early = await api(`/api/shifts/${shiftId}/rate`, { method: 'POST', token: mgr.accessToken, body: { stars: 5, toUserId: chef.userId } });
  assert.equal(early.status, 400);

  const detail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  await api(`/api/shifts/${shiftId}/accept`, { method: 'POST', token: mgr.accessToken, body: { responseId: detail.body.responses[0].id } });

  // Manager rates worker.
  const rate = await api(`/api/shifts/${shiftId}/rate`, { method: 'POST', token: mgr.accessToken, body: { stars: 5, comment: 'Great work', toUserId: chef.userId } });
  assert.equal(rate.status, 201);

  // Duplicate rating is blocked.
  const dup = await api(`/api/shifts/${shiftId}/rate`, { method: 'POST', token: mgr.accessToken, body: { stars: 4, toUserId: chef.userId } });
  assert.equal(dup.status, 400);

  // Bad star value rejected.
  const badStars = await api(`/api/shifts/${shiftId}/rate`, { method: 'POST', token: chef.accessToken, body: { stars: 9, toUserId: mgr.userId } });
  assert.equal(badStars.status, 400);

  // Worker rates manager.
  const workerRate = await api(`/api/shifts/${shiftId}/rate`, { method: 'POST', token: chef.accessToken, body: { stars: 4, toUserId: mgr.userId } });
  assert.equal(workerRate.status, 201);

  // A stranger cannot rate.
  const stranger = await makeChef(['Tandoor'], 'Stranger');
  const strangerRate = await api(`/api/shifts/${shiftId}/rate`, { method: 'POST', token: stranger.accessToken, body: { stars: 1, toUserId: chef.userId } });
  assert.equal(strangerRate.status, 400);

  // Detail reflects ratings.
  const finalDetail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  assert.equal(finalDetail.body.ratings.length, 2);
  assert.equal(finalDetail.body.ratedByMe, true);
  assert.equal(finalDetail.body.managerRated, true);
  assert.equal(finalDetail.body.workerRated, true);

  // Profile rating aggregates.
  const chefMe = await api('/api/me', { token: chef.accessToken });
  assert.equal(chefMe.body.user.rating.avg, 5);
  assert.equal(chefMe.body.user.rating.count, 1);
});

test('unknown shift id returns an error', async () => {
  const mgr = await makeManager();
  const r = await api('/api/shifts/does-not-exist', { token: mgr.accessToken });
  assert.equal(r.status, 400);
});

test('manager feed lists their own shifts with response counts', async () => {
  const mgr = await makeManager('List Mgr');
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'waiter', date: futureDate(2), startMin: 600, endMin: 960, locationName: 'List Diner', payMin: 80, payMax: 100 } });
  const shiftId = posted.body.shift.id;

  const waiter = await newUser('waiter', 'List Waiter');
  await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: waiter.accessToken, body: { kind: 'accept' } });

  const my = await api('/api/shifts/my', { token: mgr.accessToken });
  const mine = my.body.shifts.find((s) => s.id === shiftId);
  assert.ok(mine);
  assert.equal(mine.respCount, 1);
  assert.equal(mine.myResponse, null);
});
