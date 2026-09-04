import { test, assert, start, stop } from './helpers.js';

const { db, audit, getFeeRate } = await import('../src/db.js');

test.before(async () => start());
test.after(async () => stop());

test('db schema exposes the core tables', async () => {
  const tables = (await db.all(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((r) => r.table_name);
  for (const t of ['users', 'shifts', 'responses', 'fees', 'fee_records', 'ratings', 'notifications', 'refresh_tokens', 'otps', 'audit_logs']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('getFeeRate returns a number', async () => {
  const rate = await getFeeRate();
  assert.equal(typeof rate, 'number');
  assert.ok(rate > 0);
});

test('getFeeRate returns the most recent fee rate', async () => {
  const before = await getFeeRate();
  await db.run(`INSERT INTO fees (rate, label, updated_by, created_at) VALUES ($1,$2,$3,$4)`,
    0.2, '20%', 'tester', new Date().toISOString());
  assert.equal(await getFeeRate(), 0.2);
  // Restore
  await db.run(`DELETE FROM fees WHERE label = $1`, '20%');
});

test('audit writes an audit log row', async () => {
  await audit('test_action', 'Some detail', 'usr_x', '127.0.0.1');
  const row = await db.get(`SELECT * FROM audit_logs WHERE action = 'test_action'`);
  assert.ok(row);
  assert.equal(row.detail, 'Some detail');
  assert.equal(row.user_id, 'usr_x');
  assert.equal(row.ip, '127.0.0.1');
});
