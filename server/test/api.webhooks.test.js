import crypto from 'node:crypto';
import {
  test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, futureDate,
} from './helpers.js';
import { db } from '../src/db.js';
import { toPaise, fromPaise, verifyWebhookSignature } from '../src/psp.js';
import { releaseHold } from '../src/escrow.js';
import { uid, nowIso } from '../src/config.js';

const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const PATH = '/api/payments/webhook/razorpay';

let base;
test.before(async () => { base = await start(); });
test.after(async () => stop());

/** Post a webhook exactly as the provider would: raw body plus its signature. */
async function post(event, { signature, eventId } = {}) {
  const body = JSON.stringify(event);
  const sig = signature ?? crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await fetch(`${base}${PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': sig,
      'x-razorpay-event-id': eventId ?? `evt_${crypto.randomUUID()}`,
    },
    body,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, body: parsed };
}

const capturedEvent = (orderId, paymentId, amountPaise) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise } } },
});

/** A manager, a worker, a confirmed shift, and the hold it opened. */
async function matchedShift(gross = 900) {
  const mgr = await signupAndVerify({
    role: 'manager', name: 'WH Mgr', phone: uniquePhone(), email: uniqueEmail('whmgr'),
    businessName: 'WH Bistro', businessType: 'restaurant', businessAddress: 'Andheri',
  });
  const chef = await signupAndVerify({
    role: 'chef', name: 'WH Chef', phone: uniquePhone(), email: uniqueEmail('whchef'),
    specialties: ['Tandoor'], yearsExperience: 3,
  });
  const posted = await api('/api/shifts', {
    method: 'POST', token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 900,
      locationName: 'WH Bistro', lat: 19.1, lng: 72.8, payMin: gross, payMax: gross,
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
  const hold = await db.get(`SELECT * FROM escrow_holds WHERE shift_id = $1`, shiftId);
  return { mgr, chef, shiftId, hold };
}

/**
 * Put a hold into the state it would be in with a provider configured, and
 * give it an intent waiting on an order. Done directly rather than by setting
 * RAZORPAY_KEY_ID, which would change hold behaviour for the whole suite.
 */
async function awaitingPayment(hold, amountPaise = null) {
  const paise = amountPaise ?? toPaise(hold.gross_amount);
  const orderId = `order_${crypto.randomUUID().slice(0, 14)}`;
  const intentId = uid('pin');
  await db.run(`UPDATE escrow_holds SET status = 'pending_payment', funded_at = NULL WHERE id = $1`, hold.id);
  await db.run(
    `INSERT INTO payment_intents
       (id, hold_id, shift_id, payer_id, provider, provider_order_id, amount_paise, currency, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'razorpay',$5,$6,'INR','created',$7,$8)`,
    intentId, hold.id, hold.shift_id, hold.manager_id, orderId, paise, nowIso(), nowIso(),
  );
  return { intentId, orderId, paise };
}

/* ----------------------------- money maths ------------------------------- */

test('rupees convert to whole paise, and refuse to round silently', () => {
  assert.equal(toPaise(900), 90000);
  assert.equal(toPaise(1234.56), 123456);
  assert.equal(fromPaise(123456), 1234.56);
  // A third of a rupee is not representable in paise. Rounding it here would
  // surface later as an unexplainable mismatch against the provider.
  assert.throws(() => toPaise(0.333), /whole number of paise/);
  assert.throws(() => toPaise(0), /greater than zero/);
});

/* ------------------------------ signatures -------------------------------- */

test('signature verification accepts the real HMAC and nothing else', () => {
  const body = JSON.stringify({ event: 'payment.captured' });
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, good), true);
  assert.equal(verifyWebhookSignature(body, 'deadbeef'), false);
  assert.equal(verifyWebhookSignature(body, ''), false);
  assert.equal(verifyWebhookSignature(body, `${good}00`), false, 'length mismatch must not throw');
  assert.equal(verifyWebhookSignature(`${body} `, good), false, 'a single extra byte invalidates it');
});

test('an unsigned or wrongly signed webhook is refused', async () => {
  const bad = await post({ event: 'payment.captured' }, { signature: 'not-a-signature' });
  assert.equal(bad.status, 400);

  const res = await fetch(`${base}${PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'payment.captured' }),
  });
  assert.equal(res.status, 400, 'a webhook with no signature header at all');
});

test('a signature over different bytes than were sent is refused', async () => {
  // The exact failure that re-serialising req.body would cause.
  const sent = { event: 'payment.captured', payload: { a: 1, b: 2 } };
  const reordered = JSON.stringify({ event: 'payment.captured', payload: { b: 2, a: 1 } });
  const sig = crypto.createHmac('sha256', SECRET).update(reordered).digest('hex');
  const r = await post(sent, { signature: sig });
  assert.equal(r.status, 400);
});

/* -------------------------------- capture --------------------------------- */

test('payment.captured funds the hold', async () => {
  const { hold } = await matchedShift();
  const { intentId, orderId, paise } = await awaitingPayment(hold);

  const r = await post(capturedEvent(orderId, 'pay_abc123', paise));
  assert.equal(r.status, 200);

  const after = await db.get(`SELECT * FROM escrow_holds WHERE id = $1`, hold.id);
  assert.equal(after.status, 'held');
  assert.ok(after.funded_at, 'funding time is recorded');

  const intent = await db.get(`SELECT * FROM payment_intents WHERE id = $1`, intentId);
  assert.equal(intent.status, 'captured');
  assert.equal(intent.provider_payment_id, 'pay_abc123');
});

test('a redelivered capture does not fund twice', async () => {
  const { hold } = await matchedShift();
  const { orderId, paise } = await awaitingPayment(hold);
  const event = capturedEvent(orderId, 'pay_dup', paise);
  const eventId = 'evt_fixed_duplicate';

  const first = await post(event, { eventId });
  assert.equal(first.status, 200);
  assert.ok(!first.body.duplicate);

  // The provider resends until it gets a 2xx; this happens as a matter of
  // routine, so it must be a no-op rather than a second funding.
  for (let i = 0; i < 3; i++) {
    const again = await post(event, { eventId });
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true, 'a resend must be recognised as one');
  }

  const rows = await db.all(
    `SELECT id FROM webhook_events WHERE provider = 'razorpay' AND event_id = $1`, eventId,
  );
  assert.equal(rows.length, 1, 'exactly one event row survives four deliveries');

  const hold2 = await db.get(`SELECT * FROM escrow_holds WHERE id = $1`, hold.id);
  assert.equal(hold2.status, 'held');
});

test('the same payment arriving under a new event id still funds only once', async () => {
  const { hold } = await matchedShift();
  const { intentId, orderId, paise } = await awaitingPayment(hold);
  const event = capturedEvent(orderId, 'pay_again', paise);

  await post(event, { eventId: 'evt_one' });
  const second = await post(event, { eventId: 'evt_two' });
  assert.equal(second.status, 200);

  // The event id guard cannot help here, so the handler's own check has to.
  const intent = await db.get(`SELECT * FROM payment_intents WHERE id = $1`, intentId);
  assert.equal(intent.status, 'captured');
  const evt = await db.get(
    `SELECT status, error FROM webhook_events WHERE event_id = 'evt_two'`,
  );
  assert.equal(evt.status, 'ignored');
  assert.match(evt.error, /already captured/);
});

test('a capture for the wrong amount does not fund the hold', async () => {
  const { hold } = await matchedShift();
  const { orderId, paise } = await awaitingPayment(hold);

  const r = await post(capturedEvent(orderId, 'pay_short', paise - 1));
  assert.equal(r.status, 200, 'recorded and acknowledged, not retried');

  const after = await db.get(`SELECT * FROM escrow_holds WHERE id = $1`, hold.id);
  assert.equal(after.status, 'pending_payment', 'the hold stays unfunded');
});

test('a capture for an unknown order is ignored rather than erroring', async () => {
  const r = await post(capturedEvent('order_does_not_exist', 'pay_x', 5000));
  assert.equal(r.status, 200);
});

test('an unrecognised event type is acknowledged and ignored', async () => {
  const r = await post({ event: 'subscription.charged', payload: {} });
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, 'subscription.charged');
});

/* ------------------------------- releasing -------------------------------- */

test('an unfunded hold cannot be released to the worker', async () => {
  const { hold } = await matchedShift();
  await awaitingPayment(hold);

  await assert.rejects(
    () => releaseHold(hold.id),
    /has not been paid for/,
    'releasing here would pay a worker money the venue never sent',
  );

  const entries = await db.all(`SELECT * FROM ledger_entries WHERE hold_id = $1`, hold.id);
  assert.equal(entries.length, 0, 'and no ledger entry is written');
});

test('a hold released after funding credits the worker exactly once', async () => {
  const { hold } = await matchedShift();
  const { orderId, paise } = await awaitingPayment(hold);
  await post(capturedEvent(orderId, 'pay_ok', paise));

  await releaseHold(hold.id);
  await releaseHold(hold.id); // already released: must be a no-op

  const entries = await db.all(
    `SELECT * FROM ledger_entries WHERE hold_id = $1 AND kind = 'earning'`, hold.id,
  );
  assert.equal(entries.length, 1);
  assert.equal(Number(entries[0].amount), Number(hold.worker_amount));
});

/* -------------------------------- payouts --------------------------------- */

test('a failed payout returns the money to the worker ledger', async () => {
  const { chef } = await matchedShift();
  const payoutId = uid('pay');
  const providerId = `pout_${crypto.randomUUID().slice(0, 12)}`;
  const amount = 500;

  await db.run(
    `INSERT INTO payouts (id, user_id, amount, status, provider, provider_payout_id, created_at)
     VALUES ($1,$2,$3,'processing','razorpay',$4,$5)`,
    payoutId, chef.user.id, amount, providerId, nowIso(),
  );
  // requestPayout debits when the withdrawal is requested; mirror that.
  await db.run(
    `INSERT INTO ledger_entries (id, user_id, kind, amount, note, created_at)
     VALUES ($1,$2,'payout',$3,'ledger.withdrawUpi',$4)`,
    uid('led'), chef.user.id, -amount, nowIso(),
  );

  const r = await post({
    event: 'payout.failed',
    payload: { payout: { entity: { id: providerId, failure_reason: 'beneficiary bank down' } } },
  });
  assert.equal(r.status, 200);

  const row = await db.get(`SELECT * FROM payouts WHERE id = $1`, payoutId);
  assert.equal(row.status, 'failed');
  assert.match(row.failure_reason, /bank down/);

  const net = await db.get(
    `SELECT COALESCE(SUM(amount),0) AS n FROM ledger_entries WHERE user_id = $1`, chef.user.id,
  );
  assert.equal(Number(net.n), 0, 'the debit is reversed, leaving the worker whole');
});

test('a payout settling twice does not credit twice', async () => {
  const { chef } = await matchedShift();
  const providerId = `pout_${crypto.randomUUID().slice(0, 12)}`;
  await db.run(
    `INSERT INTO payouts (id, user_id, amount, status, provider, provider_payout_id, created_at)
     VALUES ($1,$2,$3,'processing','razorpay',$4,$5)`,
    uid('pay'), chef.user.id, 400, providerId, nowIso(),
  );

  const event = {
    event: 'payout.failed',
    payload: { payout: { entity: { id: providerId, failure_reason: 'declined' } } },
  };
  await post(event, { eventId: 'evt_payout_a' });
  await post(event, { eventId: 'evt_payout_b' });

  const reversals = await db.all(
    `SELECT * FROM ledger_entries WHERE user_id = $1 AND note = 'ledger.payoutReversed'`,
    chef.user.id,
  );
  assert.equal(reversals.length, 1, 'only one reversing entry despite two events');
});
