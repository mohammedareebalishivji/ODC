import { Router } from 'express';
import { db, audit } from '../db.js';
import { asyncH } from '../middleware.js';
import { uid, nowIso } from '../config.js';
import { PSP, verifyWebhookSignature, webhooksConfigured, fromPaise } from '../psp.js';
import { publish, EVENT } from '../events.js';

const router = Router();

/**
 * Provider webhooks.
 *
 * Three rules govern everything here.
 *
 * 1. Nothing is trusted before the signature is checked. The body is attacker
 *    controlled until then, so it is not parsed for meaning, only for the id
 *    needed to record it.
 * 2. The event is recorded before it is acted on. UNIQUE (provider, event_id)
 *    turns a redelivery into a collision, so money moves at most once no
 *    matter how many times the provider sends the same event.
 * 3. The status code tells the provider whether to retry. A 2xx retires the
 *    event; a 5xx brings it back. So a bad signature or an event we do not
 *    care about must return 2xx (retrying will not help), while a genuine
 *    failure on our side must return 5xx (retrying might).
 */

/* --------------------------- event handlers ------------------------------ */

/**
 * The venue's money has actually arrived. This is the only thing that moves a
 * hold from pending_payment to held.
 */
async function onPaymentCaptured(event) {
  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id) return { status: 'ignored', reason: 'no order id on payment' };

  const intent = await db.get(
    `SELECT * FROM payment_intents WHERE provider = $1 AND provider_order_id = $2`,
    PSP, payment.order_id,
  );
  if (!intent) return { status: 'ignored', reason: `no intent for order ${payment.order_id}` };
  if (intent.status === 'captured') return { status: 'ignored', reason: 'intent already captured' };

  // The amount is checked rather than assumed. A captured amount that does not
  // match what we asked for means either a tampered request or a bug on our
  // side, and funding the hold anyway would paper over both.
  if (Number(payment.amount) !== Number(intent.amount_paise)) {
    return {
      status: 'failed',
      reason: `amount mismatch: provider ${payment.amount}, intent ${intent.amount_paise}`,
    };
  }

  const ts = nowIso();
  await db.transaction(async (client) => {
    await client.query(
      `UPDATE payment_intents
          SET status = 'captured', provider_payment_id = $1, updated_at = $2
        WHERE id = $3`,
      [payment.id, ts, intent.id],
    );
    if (intent.hold_id) {
      // Only a hold still waiting on payment is advanced. One already released
      // or refunded is left alone -- a late webhook must not resurrect it.
      await client.query(
        `UPDATE escrow_holds SET status = 'held', funded_at = $1
          WHERE id = $2 AND status = 'pending_payment'`,
        [ts, intent.hold_id],
      );
    }
  });

  await audit('payment.captured', `intent=${intent.id} payment=${payment.id}`, intent.payer_id);
  publish(EVENT.PAYMENT, [intent.payer_id], {
    intentId: intent.id,
    holdId: intent.hold_id,
    shiftId: intent.shift_id,
    status: 'captured',
    amount: fromPaise(intent.amount_paise),
  });
  return { status: 'processed' };
}

async function onPaymentFailed(event) {
  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id) return { status: 'ignored', reason: 'no order id on payment' };

  const intent = await db.get(
    `SELECT * FROM payment_intents WHERE provider = $1 AND provider_order_id = $2`,
    PSP, payment.order_id,
  );
  if (!intent) return { status: 'ignored', reason: `no intent for order ${payment.order_id}` };
  // A later failure event must not undo a capture that already succeeded.
  if (intent.status === 'captured') return { status: 'ignored', reason: 'already captured' };

  await db.run(
    `UPDATE payment_intents
        SET status = 'failed', provider_payment_id = $1, failure_reason = $2, updated_at = $3
      WHERE id = $4`,
    payment.id || null,
    String(payment.error_description || payment.error_reason || 'declined').slice(0, 300),
    nowIso(), intent.id,
  );

  publish(EVENT.PAYMENT, [intent.payer_id], {
    intentId: intent.id, holdId: intent.hold_id, shiftId: intent.shift_id, status: 'failed',
  });
  return { status: 'processed' };
}

/** The provider finished (or failed) sending money out to a worker. */
async function onPayoutSettled(event, type) {
  const entity = event?.payload?.payout?.entity;
  if (!entity?.id) return { status: 'ignored', reason: 'no payout id' };

  const payout = await db.get(
    `SELECT * FROM payouts WHERE provider = $1 AND provider_payout_id = $2`,
    PSP, entity.id,
  );
  if (!payout) return { status: 'ignored', reason: `no payout row for ${entity.id}` };

  const settled = type === 'payout.processed';
  const status = settled ? 'paid' : 'failed';
  if (payout.status === status) return { status: 'ignored', reason: 'already in that state' };

  await db.run(
    `UPDATE payouts SET status = $1, failure_reason = $2, settled_at = $3 WHERE id = $4`,
    status,
    settled ? null : String(entity.failure_reason || type).slice(0, 300),
    nowIso(), payout.id,
  );

  /*
   * A failed payout must give the money back. requestPayout already debited
   * the ledger when the withdrawal was requested, so without this the worker
   * is short the amount and the provider never sent it. The reversing entry
   * is written rather than the original being deleted, because the ledger is
   * append-only and the failed attempt is part of the history.
   */
  if (!settled) {
    await db.run(
      `INSERT INTO ledger_entries (id, user_id, kind, amount, note, created_at)
       VALUES ($1,$2,'refund',$3,$4,$5)`,
      uid('led'), payout.user_id, Number(payout.amount), 'ledger.payoutReversed', nowIso(),
    );
    await audit('payout.reversed', `payout=${payout.id} amount=${payout.amount}`, payout.user_id);
  }

  publish(EVENT.PAYMENT, [payout.user_id], { payoutId: payout.id, status });
  return { status: 'processed' };
}

const HANDLERS = {
  'payment.captured': onPaymentCaptured,
  'payment.failed': onPaymentFailed,
  'payout.processed': (e) => onPayoutSettled(e, 'payout.processed'),
  'payout.failed': (e) => onPayoutSettled(e, 'payout.failed'),
  'payout.reversed': (e) => onPayoutSettled(e, 'payout.reversed'),
};

/* ------------------------------ the route -------------------------------- */

router.post(
  '/razorpay',
  asyncH(async (req, res) => {
    if (!webhooksConfigured()) {
      // Nothing can be verified without the secret, so nothing is accepted.
      // 503 rather than 200: this is a server misconfiguration, and a retry
      // after it is fixed is exactly what we want.
      res.status(503).json({ error: 'Webhooks are not configured.' });
      return;
    }

    const signature = req.get('x-razorpay-signature');
    if (!verifyWebhookSignature(req.rawBody, signature)) {
      await audit('webhook.rejected', `${PSP} signature failed`, null, req.ip);
      // 400, not 500: retrying an unsigned request will never succeed, and a
      // 5xx would have the provider hammer this endpoint.
      res.status(400).json({ error: 'Invalid signature.' });
      return;
    }

    const event = req.body || {};
    const eventType = String(event.event || '').slice(0, 100);
    // Razorpay sends its own event id in a header. Falling back to a hash of
    // the body keeps replay protection working if that header is ever absent.
    const eventId = String(
      req.get('x-razorpay-event-id')
      || `${eventType}:${event?.payload?.payment?.entity?.id || ''}:${event.created_at || ''}`,
    ).slice(0, 200);

    /*
     * Claim the event. ON CONFLICT DO NOTHING means the first delivery wins
     * and gets a row id back; a redelivery gets nothing and has to look at why.
     */
    const claimed = await db.get(
      `INSERT INTO webhook_events (id, provider, event_id, event_type, payload, status, received_at)
       VALUES ($1,$2,$3,$4,$5,'received',$6)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      uid('whk'), PSP, eventId, eventType,
      JSON.stringify(event).slice(0, 100000), nowIso(),
    );

    let id = claimed?.id;
    if (!id) {
      const prior = await db.get(
        `SELECT id, status FROM webhook_events WHERE provider = $1 AND event_id = $2`,
        PSP, eventId,
      );
      /*
       * A previous attempt that threw is worth retrying -- that is the whole
       * reason the provider is sending it again. Anything else is not:
       * 'processed' and 'ignored' are settled, and 'received' means another
       * delivery of this same event is in flight right now, so running the
       * handler again could race it.
       */
      if (!prior || prior.status !== 'failed') {
        res.json({ ok: true, duplicate: true });
        return;
      }
      id = prior.id;
      await db.run(
        `UPDATE webhook_events SET status = 'received', error = NULL, processed_at = NULL WHERE id = $1`,
        id,
      );
    }

    const handler = HANDLERS[eventType];
    if (!handler) {
      await db.run(
        `UPDATE webhook_events SET status = 'ignored', processed_at = $1 WHERE id = $2`,
        nowIso(), id,
      );
      res.json({ ok: true, ignored: eventType });
      return;
    }

    let outcome;
    try {
      outcome = await handler(event);
    } catch (err) {
      // Left on record as failed, payload and all, which is both the audit
      // trail and the flag that lets the redelivery above reprocess it.
      await db.run(
        `UPDATE webhook_events SET status = 'failed', error = $1, processed_at = $2 WHERE id = $3`,
        String(err.message).slice(0, 500), nowIso(), id,
      );
      // Rethrown so the error handler returns 5xx and the provider retries.
      throw err;
    }

    await db.run(
      `UPDATE webhook_events SET status = $1, error = $2, processed_at = $3 WHERE id = $4`,
      outcome.status === 'processed' ? 'processed' : outcome.status,
      outcome.reason ? String(outcome.reason).slice(0, 500) : null,
      nowIso(), id,
    );
    res.json({ ok: true });
  }),
);

export default router;
