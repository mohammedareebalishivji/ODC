import { Router } from 'express';
import { db } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { apiError } from '../config.js';
import { touchPresence, getPresence } from '../presence.js';

const router = Router();

const STATUSES = ['online', 'away', 'offline'];

/**
 * Explicit heartbeat.
 *
 * The SSE stream already keeps presence fresh on its own, so this exists for
 * the cases it cannot cover: marking yourself "away", or claiming a shift as
 * the one you are physically working.
 */
router.post(
  '/',
  authGuard(),
  asyncH(async (req, res) => {
    const status = typeof req.body.status === 'string' ? req.body.status : 'online';
    const shiftId = typeof req.body.shiftId === 'string' ? req.body.shiftId : null;
    if (!STATUSES.includes(status)) throw apiError('Unknown presence status.');

    if (shiftId) {
      // Claiming presence on a shift you are not part of would let anyone
      // advertise themselves as on site at someone else's venue.
      const shift = await db.get(
        `SELECT 1 FROM shifts
          WHERE id = $1 AND (manager_id = $2 OR matched_worker_id = $2)`,
        shiftId, req.user.id
      );
      if (!shift) throw apiError('You are not part of that shift.', 403);
    }

    await touchPresence(req.user.id, { status, shiftId });
    res.json({ ok: true });
  })
);

/** Presence for the other party on a shift you belong to. */
router.get(
  '/shift/:shiftId',
  authGuard(),
  asyncH(async (req, res) => {
    const shift = await db.get(
      `SELECT manager_id, matched_worker_id FROM shifts WHERE id = $1`,
      req.params.shiftId
    );
    if (!shift) throw apiError('Shift not found.', 404);

    const isParty = shift.manager_id === req.user.id
      || shift.matched_worker_id === req.user.id;
    if (!isParty) throw apiError('You are not part of that shift.', 403);

    const others = [shift.manager_id, shift.matched_worker_id]
      .filter((id) => id && id !== req.user.id);
    res.json({ presence: await getPresence(others) });
  })
);

export default router;
