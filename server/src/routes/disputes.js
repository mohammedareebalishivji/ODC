import { Router } from 'express';
import { db, audit } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { uid, nowIso, apiError } from '../config.js';
import { notifyUser } from '../notify.js';
import { releaseHold, refundHold } from '../escrow.js';

const router = Router();
const clean = (v, max = 1000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const REASONS = ['no_show', 'late', 'quality', 'underpaid', 'unsafe', 'other'];

function serialize(d) {
  return {
    id: d.id,
    shiftId: d.shift_id,
    holdId: d.hold_id,
    raisedBy: d.raised_by,
    reason: d.reason,
    detail: d.detail,
    status: d.status,
    resolution: d.resolution,
    resolutionNote: d.resolution_note,
    createdAt: d.created_at,
    resolvedAt: d.resolved_at,
  };
}

/** Disputes this user raised or is named in. */
router.get(
  '/',
  authGuard(),
  asyncH(async (req, res) => {
    const rows = await db.all(
      `SELECT * FROM disputes
        WHERE raised_by = $1 OR against_id = $1
        ORDER BY created_at DESC LIMIT 100`,
      req.user.id
    );
    res.json({ disputes: rows.map(serialize) });
  })
);

/**
 * Raise a dispute against a shift. This freezes the escrow hold so neither
 * party can move the money until O.D.C mediates.
 */
router.post(
  '/',
  authGuard(),
  asyncH(async (req, res) => {
    const shiftId = clean(req.body.shiftId, 40);
    const reason = clean(req.body.reason, 20);
    const detail = clean(req.body.detail, 1000);

    if (!REASONS.includes(reason)) throw apiError('Choose a valid reason.');

    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, shiftId);
    if (!shift) throw apiError('Shift not found.', 404);

    const isParty =
      shift.manager_id === req.user.id || shift.matched_worker_id === req.user.id;
    if (!isParty) throw apiError('You are not part of this shift.', 403);

    const existing = await db.get(
      `SELECT id FROM disputes WHERE shift_id = $1 AND status <> 'resolved'`,
      shiftId
    );
    if (existing) throw apiError('A dispute is already open for this shift.', 409);

    const hold = await db.get(`SELECT * FROM escrow_holds WHERE shift_id = $1`, shiftId);
    if (hold && hold.status === 'released') {
      throw apiError('This payment has already been released and cannot be disputed here.');
    }

    const against =
      shift.manager_id === req.user.id ? shift.matched_worker_id : shift.manager_id;
    const id = uid('dsp');
    const ts = nowIso();

    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO disputes
           (id, shift_id, hold_id, raised_by, against_id, reason, detail, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8)`,
        [id, shiftId, hold?.id ?? null, req.user.id, against, reason, detail, ts]
      );
      if (hold) {
        // Freeze the money for the duration of the dispute.
        await client.query(
          `UPDATE escrow_holds SET status = 'disputed' WHERE id = $1 AND status = 'held'`,
          [hold.id]
        );
      }
    });

    if (against) {
      await notifyUser(against, 'notif.disputeRaised.title', 'notif.disputeRaised.body', 'dispute', { disputeId: id });
    }
    await audit('dispute.opened', `dispute=${id} shift=${shiftId}`, req.user.id);
    res.status(201).json({ id, status: 'open' });
  })
);

/* -------------------------------------------------------------------------
   Admin mediation. Mounted under the private admin path by app.js, so these
   handlers additionally assert the admin role.
------------------------------------------------------------------------- */

router.get(
  '/admin/queue',
  authGuard(['admin']),
  asyncH(async (_req, res) => {
    const rows = await db.all(
      `SELECT d.*, s.location_name, s.date
         FROM disputes d JOIN shifts s ON s.id = d.shift_id
        WHERE d.status <> 'resolved'
        ORDER BY d.created_at`
    );
    res.json({
      disputes: rows.map((d) => ({
        ...serialize(d),
        locationName: d.location_name,
        date: d.date,
      })),
    });
  })
);

router.post(
  '/admin/:id/resolve',
  authGuard(['admin']),
  asyncH(async (req, res) => {
    const resolution = clean(req.body.resolution, 20);
    const note = clean(req.body.note, 1000);
    if (!['release_worker', 'refund_manager'].includes(resolution)) {
      throw apiError('Choose how to settle the escrow.');
    }

    const dispute = await db.get(`SELECT * FROM disputes WHERE id = $1`, req.params.id);
    if (!dispute) throw apiError('Dispute not found.', 404);
    if (dispute.status === 'resolved') throw apiError('This dispute is already resolved.');

    if (dispute.hold_id) {
      // Lift the freeze so the escrow helpers accept the transition.
      await db.run(
        `UPDATE escrow_holds SET status = 'held' WHERE id = $1 AND status = 'disputed'`,
        dispute.hold_id
      );
      if (resolution === 'release_worker') await releaseHold(dispute.hold_id, req.user.id);
      else await refundHold(dispute.hold_id, req.user.id);
    }

    await db.run(
      `UPDATE disputes
          SET status = 'resolved', resolution = $1, resolution_note = $2,
              resolved_by = $3, resolved_at = $4
        WHERE id = $5`,
      resolution, note, req.user.id, nowIso(), dispute.id
    );

    for (const uidTarget of [dispute.raised_by, dispute.against_id].filter(Boolean)) {
      await notifyUser(uidTarget, 'notif.disputeResolved.title', note || 'notif.disputeResolved.body', 'dispute', { disputeId: dispute.id });
    }
    await audit('dispute.resolved', `dispute=${dispute.id} → ${resolution}`, req.user.id);
    res.json({ id: dispute.id, status: 'resolved', resolution });
  })
);

export default router;
