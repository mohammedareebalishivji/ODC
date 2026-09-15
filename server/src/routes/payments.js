import { Router } from 'express';
import { db } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { uid, nowIso, apiError } from '../config.js';
import {
  balanceOf,
  escrowedFor,
  requestPayout,
  releaseHold,
  serializeHold,
  serializeEntry,
} from '../escrow.js';

const router = Router();
const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Wallet summary — the numbers across the top of the Payment Hub. */
router.get(
  '/summary',
  authGuard(),
  asyncH(async (req, res) => {
    const [available, inEscrow] = await Promise.all([
      balanceOf(req.user.id),
      escrowedFor(req.user.id),
    ]);
    const methods = await db.all(
      `SELECT * FROM payout_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at`,
      req.user.id
    );
    res.json({
      available,
      inEscrow,
      methods: methods.map((m) => ({
        id: m.id,
        kind: m.kind,
        upiId: m.upi_id,
        accountLast4: m.account_last4,
        isDefault: !!m.is_default,
      })),
    });
  })
);

/** Ledger — the transaction history list. */
router.get(
  '/transactions',
  authGuard(),
  asyncH(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db.all(
      `SELECT * FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      req.user.id, limit
    );
    res.json({ transactions: rows.map(serializeEntry) });
  })
);

/** Holds visible to this user, whichever side of the shift they are on. */
router.get(
  '/escrow',
  authGuard(),
  asyncH(async (req, res) => {
    const rows = await db.all(
      `SELECT * FROM escrow_holds
        WHERE worker_id = $1 OR manager_id = $1
        ORDER BY created_at DESC LIMIT 100`,
      req.user.id
    );
    res.json({ holds: rows.map(serializeHold) });
  })
);

router.post(
  '/methods',
  authGuard(),
  asyncH(async (req, res) => {
    const kind = clean(req.body.kind, 10);
    if (!['upi', 'bank'].includes(kind)) throw apiError('Choose UPI or bank.');

    const upiId = clean(req.body.upiId, 80);
    const accountNumber = clean(req.body.accountNumber, 32);
    const ifsc = clean(req.body.ifsc, 16).toUpperCase();

    if (kind === 'upi' && !/^[\w.\-]{2,60}@[a-zA-Z]{2,20}$/.test(upiId)) {
      throw apiError('Enter a valid UPI ID, for example name@bank.');
    }
    if (kind === 'bank') {
      if (!/^\d{9,18}$/.test(accountNumber)) throw apiError('Enter a valid account number.');
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw apiError('Enter a valid IFSC code.');
    }

    const id = uid('pm');
    const existing = await db.get(
      `SELECT COUNT(*)::int AS n FROM payout_methods WHERE user_id = $1`,
      req.user.id
    );
    const isDefault = (existing?.n ?? 0) === 0 ? 1 : 0;

    await db.run(
      `INSERT INTO payout_methods
         (id, user_id, kind, upi_id, account_last4, ifsc, is_default, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      id, req.user.id, kind,
      kind === 'upi' ? upiId : null,
      // Only the last 4 digits are retained — the full number is never stored.
      kind === 'bank' ? accountNumber.slice(-4) : null,
      kind === 'bank' ? ifsc : null,
      isDefault, nowIso()
    );
    res.status(201).json({ id, kind, isDefault: !!isDefault });
  })
);

router.post(
  '/withdraw',
  authGuard(),
  asyncH(async (req, res) => {
    const result = await requestPayout({
      userId: req.user.id,
      amount: Number(req.body.amount),
      methodId: clean(req.body.methodId, 40),
    });
    res.status(201).json(result);
  })
);

/**
 * Venue approves the shift, which releases the held money to the worker.
 * Only the manager who owns the shift may do this.
 */
router.post(
  '/escrow/:holdId/release',
  authGuard(['manager']),
  asyncH(async (req, res) => {
    const hold = await db.get(`SELECT * FROM escrow_holds WHERE id = $1`, req.params.holdId);
    if (!hold) throw apiError('Escrow record not found.', 404);
    if (hold.manager_id !== req.user.id) {
      throw apiError('You can only release your own shifts.', 403);
    }
    if (hold.status === 'disputed') {
      throw apiError('This payment is under dispute and can only be settled by O.D.C.', 409);
    }
    const updated = await releaseHold(hold.id, req.user.id);
    res.json(serializeHold(updated));
  })
);

export default router;
