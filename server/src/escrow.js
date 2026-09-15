import { db, getFeeRate, audit } from './db.js';
import { uid, nowIso, apiError } from './config.js';

/**
 * Escrow + ledger primitives.
 *
 * Invariant: a user's balance is always SUM(ledger_entries.amount) for that
 * user. Nothing writes a balance directly. Every state change to an
 * escrow_hold writes the matching ledger rows in the same transaction, so the
 * ledger and the hold table can never disagree.
 */

/** Round to paise — floats accumulate error across a ledger sum otherwise. */
export function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function splitFee(gross, feeRate) {
  const fee = money(gross * feeRate);
  return { gross: money(gross), fee, worker: money(gross - fee) };
}

export async function balanceOf(userId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE user_id = $1`,
    userId
  );
  return money(row?.balance ?? 0);
}

/** Total still sitting in escrow for a worker — earned but not yet released. */
export async function escrowedFor(userId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(worker_amount), 0) AS total
       FROM escrow_holds
      WHERE worker_id = $1 AND status IN ('held','disputed')`,
    userId
  );
  return money(row?.total ?? 0);
}

/**
 * Open a hold when a shift is confirmed. The venue's money is committed at
 * this point; the worker cannot draw on it until the shift is approved.
 */
export async function openHold({ shiftId, managerId, workerId, grossAmount }) {
  const existing = await db.get(`SELECT id FROM escrow_holds WHERE shift_id = $1`, shiftId);
  if (existing) return existing.id;

  const feeRate = await getFeeRate();
  const { gross, fee, worker } = splitFee(grossAmount, feeRate);
  if (gross <= 0) throw apiError('Shift value must be greater than zero.');

  const id = uid('hold');
  await db.run(
    `INSERT INTO escrow_holds
       (id, shift_id, manager_id, worker_id, gross_amount, fee_amount, worker_amount, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'held',$8)`,
    id, shiftId, managerId, workerId, gross, fee, worker, nowIso()
  );
  await audit('escrow.hold_opened', `shift=${shiftId} gross=${gross}`, managerId);
  return id;
}

/**
 * Release a held shift to the worker: credits the worker's ledger with their
 * net amount and books the platform fee. Idempotent on already-released holds.
 */
export async function releaseHold(holdId, actorId = null) {
  const hold = await db.get(`SELECT * FROM escrow_holds WHERE id = $1`, holdId);
  if (!hold) throw apiError('Escrow record not found.', 404);
  if (hold.status === 'released') return hold;
  if (hold.status === 'refunded') {
    throw apiError('This payment was already refunded to the venue.');
  }
  if (!hold.worker_id) throw apiError('No worker is assigned to this shift.');

  const ts = nowIso();
  await db.transaction(async (client) => {
    await client.query(
      `UPDATE escrow_holds SET status = 'released', released_at = $1 WHERE id = $2`,
      [ts, holdId]
    );
    // The worker is credited their net amount. The platform fee is not a
    // worker ledger entry — it lives on the hold (and in fee_records), which
    // is what the treasury console reports on.
    await client.query(
      `INSERT INTO ledger_entries (id, user_id, hold_id, shift_id, kind, amount, note, created_at)
       VALUES ($1,$2,$3,$4,'earning',$5,$6,$7)`,
      [uid('led'), hold.worker_id, holdId, hold.shift_id, hold.worker_amount, 'ledger.shiftPayout', ts]
    );
    await client.query(
      `UPDATE fee_records SET settled = 1 WHERE shift_id = $1`,
      [hold.shift_id]
    );
  });

  await audit('escrow.released', `hold=${holdId} worker=${hold.worker_id}`, actorId);
  return { ...hold, status: 'released', released_at: ts };
}

/** Refund a hold back to the venue — no worker credit is written. */
export async function refundHold(holdId, actorId = null) {
  const hold = await db.get(`SELECT * FROM escrow_holds WHERE id = $1`, holdId);
  if (!hold) throw apiError('Escrow record not found.', 404);
  if (hold.status === 'refunded') return hold;
  if (hold.status === 'released') {
    throw apiError('This payment was already released to the worker.');
  }

  const ts = nowIso();
  await db.run(
    `UPDATE escrow_holds SET status = 'refunded', released_at = $1 WHERE id = $2`,
    ts, holdId
  );
  await audit('escrow.refunded', `hold=${holdId}`, actorId);
  return { ...hold, status: 'refunded', released_at: ts };
}

/**
 * Withdraw to a payout method. Debits the ledger and records a payout row.
 * The debit and the payout row are written together so a crash can't leave a
 * paid-out user with their balance intact.
 */
export async function requestPayout({ userId, amount, methodId }) {
  const amt = money(amount);
  if (!(amt > 0)) throw apiError('Enter an amount greater than zero.');

  const available = await balanceOf(userId);
  if (amt > available) {
    throw apiError(`You can withdraw at most ₹${available.toFixed(2)}.`);
  }

  const method = await db.get(
    `SELECT * FROM payout_methods WHERE id = $1 AND user_id = $2`,
    methodId, userId
  );
  if (!method) throw apiError('Select a valid payout method.');

  const id = uid('pay');
  const ts = nowIso();
  await db.transaction(async (client) => {
    await client.query(
      `INSERT INTO payouts (id, user_id, method_id, amount, status, created_at)
       VALUES ($1,$2,$3,$4,'pending',$5)`,
      [id, userId, methodId, amt, ts]
    );
    await client.query(
      `INSERT INTO ledger_entries (id, user_id, kind, amount, note, created_at)
       VALUES ($1,$2,'payout',$3,$4,$5)`,
      [uid('led'), userId, -amt, method.kind === 'upi' ? 'ledger.withdrawUpi' : 'ledger.withdrawBank', ts]
    );
  });

  await audit('payout.requested', `payout=${id} amount=${amt}`, userId);
  return { id, amount: amt, status: 'pending', createdAt: ts };
}

export function serializeHold(h) {
  return {
    id: h.id,
    shiftId: h.shift_id,
    grossAmount: h.gross_amount,
    feeAmount: h.fee_amount,
    workerAmount: h.worker_amount,
    status: h.status,
    createdAt: h.created_at,
    releasedAt: h.released_at,
  };
}

export function serializeEntry(e) {
  return {
    id: e.id,
    kind: e.kind,
    amount: e.amount,
    note: e.note,
    shiftId: e.shift_id,
    createdAt: e.created_at,
  };
}
