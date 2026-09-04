import { test, assert, mkUser, insertShift } from './helpers.js';

const { db } = await import('../src/db.js');
const { expirePastShifts } = await import('../src/jobs.js');
const { uid, nowIso } = await import('../src/config.js');

test('expirePastShifts marks overdue open shifts as expired', async () => {
  const { id: managerId } = await mkUser({ role: 'manager' });
  const { id: workerId } = await mkUser({ role: 'chef', available: 1 });
  const shiftId = await insertShift({ managerId, expiresInMs: -1000 });

  await db.run(`INSERT INTO responses (id, shift_id, worker_id, kind, amount, status, created_at) VALUES ($1,$2,$3,$4,$5, 'pending', $6)`,
    uid('rsp'), shiftId, workerId, 'accept', 150, nowIso());

  await expirePastShifts();

  const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, shiftId);
  assert.equal(shift.status, 'expired');

  const resp = await db.get(`SELECT * FROM responses WHERE shift_id = $1`, shiftId);
  assert.equal(resp.status, 'declined');

  const ntf = await db.get(`SELECT * FROM notifications WHERE user_id = $1 AND type = 'shift_expired'`, managerId);
  assert.ok(ntf, 'manager should be notified of expiry');
});

test('expirePastShifts warns once for shifts expiring soon', async () => {
  const { id: managerId } = await mkUser({ role: 'manager' });
  const shiftId = await insertShift({ managerId, expiresInMs: 60 * 60 * 1000 });

  await expirePastShifts();

  const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, shiftId);
  assert.equal(shift.status, 'open');
  assert.equal(shift.warned_soon, 1);

  const ntf = await db.get(`SELECT * FROM notifications WHERE user_id = $1 AND type = 'expiring_soon'`, managerId);
  assert.ok(ntf, 'manager should receive an expiring-soon notice');
  assert.match(ntf.title, /Expiring soon/);
});

test('expirePastShifts leaves healthy shifts alone', async () => {
  const { id: managerId } = await mkUser({ role: 'manager' });
  const shiftId = await insertShift({ managerId, expiresInMs: 12 * 3600_000 });

  await expirePastShifts();

  const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, shiftId);
  assert.equal(shift.status, 'open');
  assert.equal(shift.warned_soon, 0);
});

test('expirePastShifts cleans up expired refresh tokens', async () => {
  const { id } = await mkUser({ role: 'manager' });
  const { hashToken } = await import('../src/security.js');
  await db.run(`INSERT INTO refresh_tokens (id, user_id, token_hash, device, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    uid('rt'), id, hashToken('stale-token'), 'web', new Date(Date.now() - 1000).toISOString(), nowIso());

  await expirePastShifts();

  assert.equal((await db.get(`SELECT COUNT(*)::int n FROM refresh_tokens WHERE user_id = $1`, id)).n, 0);
});
