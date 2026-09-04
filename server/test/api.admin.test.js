import { test, assert, api, start, stop, newUser, signupAndVerify, uniquePhone, uniqueEmail, resetRateLimit } from './helpers.js';

test.before(async () => start());
test.beforeEach(async () => resetRateLimit());
test.after(async () => stop());

const ADMIN_EMAIL = 'testsuperadmin@odc.in';
const ADMIN_PASS = 'Test@1234';
const ADMIN_CODE = '000000';
const BASE = '/tail/z7k9x2/admin';

async function adminLogin() {
  const r = await api(`${BASE}/login`, { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASS, code: ADMIN_CODE } });
  return r;
}

test('admin login validates credentials and 2FA', async () => {
  const wrongPw = await api(`${BASE}/login`, { method: 'POST', body: { email: ADMIN_EMAIL, password: 'wrong', code: ADMIN_CODE } });
  assert.equal(wrongPw.status, 400);

  const wrongCode = await api(`${BASE}/login`, { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASS, code: '111111' } });
  assert.equal(wrongCode.status, 400);

  const ok = await adminLogin();
  assert.equal(ok.status, 200);
  assert.equal(ok.body.admin.role, 'admin');
  assert.ok(ok.body.accessToken);
});

test('admin stats are locked behind admin tokens', async () => {
  const noAuth = await api(`${BASE}/stats`);
  assert.equal(noAuth.status, 401);

  const worker = await newUser('waiter', 'Stats Worker');
  const denied = await api(`${BASE}/stats`, { token: worker.accessToken });
  assert.equal(denied.status, 403);

  const ok = await adminLogin();
  const stats = await api(`${BASE}/stats`, { token: ok.body.accessToken });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.stats.users >= 1);
  assert.ok('roles' in stats.body.stats);
  assert.ok('shifts' in stats.body.stats);
  assert.ok('fillRate' in stats.body.stats);
  assert.ok('revenue' in stats.body.stats);
  assert.equal(stats.body.feeRate, 0.1);
});

test('admin can list and filter users', async () => {
  await newUser('chef', 'Admin List Chef');
  await newUser('manager', 'Admin List Mgr');
  const ok = await adminLogin();

  const all = await api(`${BASE}/users`, { token: ok.body.accessToken });
  assert.equal(all.status, 200);
  assert.ok(all.body.users.some((u) => u.role === 'chef'));

  const chefs = await api(`${BASE}/users?role=chef`, { token: ok.body.accessToken });
  assert.ok(chefs.body.users.every((u) => u.role === 'chef'));
  assert.ok(chefs.body.users.length >= 1);
});

test('admin can verify / suspend / ban users and the effect sticks', async () => {
  const ok = await adminLogin();
  const phone = uniquePhone();
  const email = uniqueEmail('adminmod');
  const s = await api('/api/auth/signup', { method: 'POST', body: { role: 'chef', name: 'Admin Mod', phone, email, password: 'Strong!Pass123', specialties: ['Tandoor'] } });
  await api('/api/auth/verify', { method: 'POST', body: { phone, code: s.body.devCode } });

  const { db } = await import('../src/db.js');
  const user = await db.get(`SELECT * FROM users WHERE phone = $1`, phone);
  assert.equal(user.verified_badge, 0);

  const verify = await api(`${BASE}/users/${user.id}`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'verify' } });
  assert.equal(verify.status, 200);
  assert.equal((await db.get(`SELECT verified_badge FROM users WHERE id = $1`, user.id)).verified_badge, 1);

  const suspend = await api(`${BASE}/users/${user.id}`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'suspend' } });
  assert.equal(suspend.status, 200);

  const login = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'Strong!Pass123' } });
  assert.equal(login.status, 400);
  assert.match(login.body.error, /suspended/i);

  const unsuspend = await api(`${BASE}/users/${user.id}`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'unsuspend' } });
  assert.equal(unsuspend.status, 200);
  const login2 = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'Strong!Pass123' } });
  assert.equal(login2.status, 200);

  const ban = await api(`${BASE}/users/${user.id}`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'ban' } });
  assert.equal(ban.status, 200);
  const login3 = await api('/api/auth/login', { method: 'POST', body: { identifier: phone, password: 'Strong!Pass123' } });
  assert.equal(login3.status, 400);
  assert.match(login3.body.error, /banned/i);

  const unknown = await api(`${BASE}/users/does-not-exist`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'ban' } });
  assert.equal(unknown.status, 400);

  const badAction = await api(`${BASE}/users/${user.id}`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'punch' } });
  assert.equal(badAction.status, 400);
});

test('admin cannot act on other admins', async () => {
  const ok = await adminLogin();
  const { db } = await import('../src/db.js');
  const admin = await db.get(`SELECT * FROM users WHERE role = 'admin'`);
  const r = await api(`${BASE}/users/${admin.id}`, { method: 'PATCH', token: ok.body.accessToken, body: { action: 'ban' } });
  assert.equal(r.status, 400);
});

test('admin shifts and ratings endpoints respond', async () => {
  const mgr = await signupAndVerify({ role: 'manager', name: 'Admin Shifts Mgr', phone: uniquePhone(), email: uniqueEmail('admsh'), businessName: 'B', businessType: 'r', businessAddress: 'A' });
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: (() => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), startMin: 600, endMin: 960, locationName: 'X', payMin: 100, payMax: 120 } });
  assert.equal(posted.status, 201);

  const ok = await adminLogin();
  const shifts = await api(`${BASE}/shifts`, { token: ok.body.accessToken });
  assert.equal(shifts.status, 200);
  assert.ok(shifts.body.shifts.some((s) => s.id === posted.body.shift.id));
  const myShift = shifts.body.shifts.find((s) => s.id === posted.body.shift.id);
  assert.equal(myShift.managerName, 'Admin Shifts Mgr');

  const ratings = await api(`${BASE}/ratings`, { token: ok.body.accessToken });
  assert.equal(ratings.status, 200);
  assert.ok(Array.isArray(ratings.body.ratings));
});

test('fee rate can be updated and recalcs matched fee records', async () => {
  const mgr = await signupAndVerify({ role: 'manager', name: 'Fee Mgr', phone: uniquePhone(), email: uniqueEmail('fee'), businessName: 'B', businessType: 'r', businessAddress: 'A' });
  const chef = await signupAndVerify({ role: 'chef', name: 'Fee Chef', phone: uniquePhone(), email: uniqueEmail('feec'), specialties: ['Tandoor'] });
  const posted = await api('/api/shifts', { method: 'POST', token: mgr.accessToken, body: { role: 'chef', specialty: 'Tandoor', date: (() => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), startMin: 600, endMin: 960, locationName: 'X', payMin: 100, payMax: 120 } });
  const shiftId = posted.body.shift.id;
  await api(`/api/shifts/${shiftId}/respond`, { method: 'POST', token: chef.accessToken, body: { kind: 'accept' } });
  const detail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  await api(`/api/shifts/${shiftId}/accept`, { method: 'POST', token: mgr.accessToken, body: { responseId: detail.body.responses[0].id } });

  const ok = await adminLogin();
  const before = await api(`${BASE}/fees`, { token: ok.body.accessToken });
  assert.equal(before.status, 200);
  assert.equal(before.body.feeRate, 0.1);

  const invalid = await api(`${BASE}/fees`, { method: 'PUT', token: ok.body.accessToken, body: { rate: 99 } });
  assert.equal(invalid.status, 400);

  const update = await api(`${BASE}/fees`, { method: 'PUT', token: ok.body.accessToken, body: { rate: 15, label: 'Launch' } });
  assert.equal(update.status, 200);
  assert.equal(update.body.feeRate, 0.15);

  const { db } = await import('../src/db.js');
  const fee = await db.get(`SELECT * FROM fee_records WHERE shift_id = $1`, shiftId);
  assert.equal(fee.fee_rate, 0.15);
  assert.equal(fee.fee_amount, 18); // 15% of 120
  assert.equal(fee.worker_payout, 102);
});

test('admin announcements notify targeted users', async () => {
  const waiter = await newUser('waiter', 'Announce Waiter');
  const ok = await adminLogin();

  const r = await api(`${BASE}/announcements`, { method: 'POST', token: ok.body.accessToken, body: { message: 'System maintenance tonight', target: 'waiter' } });
  assert.equal(r.status, 201);
  assert.ok(r.body.sentTo >= 1);

  const { db } = await import('../src/db.js');
  const n = await db.get(`SELECT * FROM notifications WHERE user_id = $1 AND type = 'announcement'`, waiter.userId);
  assert.ok(n);
  assert.match(n.body, /System maintenance/i);

  const empty = await api(`${BASE}/announcements`, { method: 'POST', token: ok.body.accessToken, body: { message: '' } });
  assert.equal(empty.status, 400);
});

test('audit logs are queryable', async () => {
  const ok = await adminLogin();
  const r = await api(`${BASE}/audit-logs`, { token: ok.body.accessToken });
  assert.equal(r.status, 200);
  assert.ok(r.body.logs.length >= 1);
});

test('admin self profile, password, and permanent code endpoints', async () => {
  const ok = await adminLogin();

  const self = await api(`${BASE}/self`, { token: ok.body.accessToken });
  assert.equal(self.status, 200);
  assert.equal(self.body.admin.email, ADMIN_EMAIL);
  assert.equal(self.body.staticCode, '000000');

  const rename = await api(`${BASE}/self`, { method: 'PATCH', token: ok.body.accessToken, body: { name: 'Renamed Admin' } });
  assert.equal(rename.status, 200);
  assert.equal(rename.body.admin.name, 'Renamed Admin');

  const badPw = await api(`${BASE}/self/password`, { method: 'POST', token: ok.body.accessToken, body: { currentPassword: 'nope', newPassword: 'OdcAdmin!999' } });
  assert.equal(badPw.status, 400);

  const changePw = await api(`${BASE}/self/password`, { method: 'POST', token: ok.body.accessToken, body: { currentPassword: ADMIN_PASS, newPassword: 'OdcAdmin!999' } });
  assert.equal(changePw.status, 200);

  // Old password no longer works, new one does.
  const oldLogin = await api(`${BASE}/login`, { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASS, code: ADMIN_CODE } });
  assert.equal(oldLogin.status, 400);
  const newLogin = await api(`${BASE}/login`, { method: 'POST', body: { email: ADMIN_EMAIL, password: 'OdcAdmin!999', code: ADMIN_CODE } });
  assert.equal(newLogin.status, 200);

  const changeCode = await api(`${BASE}/self/code`, { method: 'POST', token: ok.body.accessToken, body: { currentPassword: 'OdcAdmin!999', code: '123456' } });
  assert.equal(changeCode.status, 200);
  assert.equal(changeCode.body.staticCode, '123456');

  // New permanent code works.
  const codeLogin = await api(`${BASE}/login`, { method: 'POST', body: { email: ADMIN_EMAIL, password: 'OdcAdmin!999', code: '123456' } });
  assert.equal(codeLogin.status, 200);

  const badCode = await api(`${BASE}/self/code`, { method: 'POST', token: ok.body.accessToken, body: { currentPassword: 'OdcAdmin!999', code: '12' } });
  assert.equal(badCode.status, 400);
});

test('provisioning and create-admin are guarded', async () => {
  const provision = await api(`${BASE}/provision`);
  assert.equal(provision.status, 200);

  const create = await api(`${BASE}/create-admin`, { method: 'POST', body: {} });
  assert.equal(create.status, 400);
});
