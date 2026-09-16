import { Router } from 'express';
import crypto from 'node:crypto';
import { db, getFeeRate, audit } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { uid, nowIso, apiError, JWT_SECRET } from '../config.js';
import { notifyUser, notifyMatchingWorkers } from '../notify.js';
import { openHold } from '../escrow.js';
import { publish, EVENT } from '../events.js';

const router = Router();

/** Deterministic 4-digit arrival code shared by the venue and the worker. */
function proximityCode(shiftId) {
  const h = crypto.createHmac('sha256', JWT_SECRET).update(`proximity:${shiftId}`).digest();
  return String(h.readUInt32BE(0) % 10000).padStart(4, '0');
}

/** Short human-quotable reference, e.g. ODC-8B42-CP. */
function refCode(shiftId) {
  const h = crypto.createHash('sha256').update(shiftId).digest('hex').toUpperCase();
  return `ODC-${h.slice(0, 4)}-${h.slice(4, 6)}`;
}

const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EXPIRY_MS = 12 * 60 * 60 * 1000;

function currentFee() {
  return getFeeRate();
}

function megaMinutes(dateStr, startMin, endMin) {
  const base = new Date(`${dateStr}T00:00:00Z`);
  if (startMin > endMin) throw apiError('End time must be after start time.');
  if (endMin - startMin > 24 * 60) throw apiError('A shift cannot be longer than 24 hours.');
  return { startsAt: new Date(base.getTime() + startMin * 60000).toISOString(), endsAt: new Date(base.getTime() + endMin * 60000).toISOString() };
}

function urgencyMs(shift) {
  return Math.max(0, new Date(shift.expires_at).getTime() - Date.now());
}

async function serializeShift(s, viewer) {
  const manager = await db.get(`SELECT * FROM users WHERE id = $1`, s.manager_id);
  const business = manager ? await db.get(`SELECT * FROM manager_profiles WHERE user_id = $1`, manager.id) : null;
  const worker = s.matched_worker_id ? await db.get(`SELECT * FROM users WHERE id = $1`, s.matched_worker_id) : null;
  const remaining = urgencyMs(s);
  return {
    id: s.id,
    role: s.role,
    specialty: s.specialty,
    date: s.date,
    startMin: s.start_min,
    endMin: s.end_min,
    locationName: s.location_name,
    lat: s.lat,
    lng: s.lng,
    payMin: s.pay_min,
    payMax: s.pay_max,
    notes: s.notes,
    dressCode: s.dress_code,
    status: s.status,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    remainingMs: remaining,
    urgency: remaining > 2 * 3600_000 ? 'ok' : remaining > 0 ? 'soon' : 'gone',
    manager: manager ? {
      name: manager.name,
      business: business ? business.business_name : null,
      type: business ? business.business_type : null,
      address: business ? business.business_address : null,
      verified: !!manager.verified_badge,
      phone: s.status === 'matched' ? manager.phone : null,
    } : null,
    worker: worker ? { name: worker.name, role: worker.role, verified: !!worker.verified_badge, phone: s.status === 'matched' ? worker.phone : null } : null,
    agreedPay: s.agreed_pay,
    matchedAt: s.matched_at,
    checkedInAt: s.checked_in_at,
    completedAt: s.completed_at,
    // Both parties see the same code so the venue can verify the arrival.
    proximityCode: s.status === 'matched' ? proximityCode(s.id) : null,
    referenceCode: refCode(s.id),
    viewerIsManager: viewer && viewer.id === s.manager_id,
    viewerIsWorker: viewer && s.matched_worker_id === viewer.id,
  };
}

async function serializeResponse(r) {
  const worker = await db.get(`SELECT * FROM users WHERE id = $1`, r.worker_id);
  const avg = await db.get(`SELECT AVG(stars)::float avg, COUNT(*)::int n FROM ratings WHERE to_user = $1`, r.worker_id);
  return {
    id: r.id,
    kind: r.kind,
    amount: r.amount,
    status: r.status,
    createdAt: r.created_at,
    worker: worker ? {
      name: worker.name, role: worker.role, verified: !!worker.verified_badge, photo: worker.photo_data,
      rating: { avg: avg.avg || 0, count: avg.n },
    } : null,
  };
}

const publicRoles = ['manager', 'chef', 'waiter'];

router.post('/',
  authGuard(['manager']),
  asyncH(async (req, res) => {
    const { role, specialty, date, startMin, endMin, locationName, lat, lng, payMin, payMax, notes, dressCode } = req.body;
    if (!['chef', 'waiter'].includes(role)) throw apiError('Choose a role for this shift (Chef or Waiter).');
    if (!specialty && role === 'chef') throw apiError('Choose what kind of chef you need.');
    if (!date) throw apiError('Pick a date for the shift.');
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) throw apiError('Pick shift times.');
    if (!clean(locationName)) throw apiError('Tell us where the shift is.');
    const payMinN = Number(payMin);
    const payMaxN = Number(payMax);
    if (!Number.isFinite(payMinN) || !Number.isFinite(payMaxN) || payMinN <= 0 || payMaxN < payMinN) {
      throw apiError('Pick a pay range with a minimum above $0.');
    }
    const newDate = new Date(`${date}T00:00:00Z`);
    if (isNaN(newDate.getTime())) throw apiError('That date does not look right.');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    if (date < `${y}-${m}-${d}`) throw apiError('The shift date has already passed.');
    megaMinutes(date, startMin, endMin);

    const id = uid('shf');
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    await db.run(
      `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, lat, lng, pay_min, pay_max, notes, dress_code, status, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',$15,$16)`,
      id, req.user.id, role, specialty || null, date, startMin, endMin,
      clean(locationName, 140), Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null,
      payMinN, payMaxN, clean(notes, 600), clean(dressCode, 140), createdAt, expiresAt
    );

    await audit('shift_posted', `Shift ${id} posted for ${role}${specialty ? '/' + specialty : ''}`, req.user.id);
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, id);
    await notifyMatchingWorkers(shift);
    await notifyUser(req.user.id, 'notif.shiftPosted.title', 'notif.shiftPosted.body', 'shift_posted', { shiftId: id });

    res.status(201).json({ shift: await serializeShift(shift, req.user) });
  })
);

router.get('/open',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    const u = req.user;
    let rows = await db.all(
      `SELECT * FROM shifts WHERE status = 'open' AND role = $1 AND expires_at > $2 ORDER BY created_at DESC LIMIT 100`,
      u.role, new Date().toISOString()
    );

    let specMap = null;
    if (u.role === 'chef') {
      const p = await db.get(`SELECT specialties FROM chef_profiles WHERE user_id = $1`, u.id);
      specMap = new Set((p ? JSON.parse(p.specialties || '[]') : []).map((t) => String(t).toLowerCase()));
    }

    const owned = new Set((await db.all(`SELECT shift_id FROM responses WHERE worker_id = $1`, u.id)).map((r) => r.shift_id));

    rows = rows.filter((s) => {
      if (owned.has(s.id)) return false;
      if (s.role === 'chef' && s.specialty && specMap && !specMap.has(String(s.specialty).toLowerCase())) return false;
      const { lat, lng } = s;
      if (Number.isFinite(req.query.lat)) {
        const dLat = lat === null ? Infinity : Math.abs(lat - req.query.lat);
        const dLng = lng === null ? Infinity : Math.abs(lng - req.query.lng);
        if (Math.max(dLat, dLng) > 0.3) return false;
      }
      return true;
    });
    res.json({ shifts: await Promise.all(rows.map((s) => serializeShift(s, u))) });
  })
);

router.get('/my',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    let shifts = [];
    if (req.user.role === 'manager') {
      shifts = await db.all(
        `SELECT * FROM shifts WHERE manager_id = $1 ORDER BY created_at DESC LIMIT 200`, req.user.id
      );
    } else {
      shifts = await db.all(
        `SELECT DISTINCT s.* FROM shifts s JOIN responses r ON r.shift_id = s.id WHERE r.worker_id = $1 ORDER BY s.created_at DESC LIMIT 200`,
        req.user.id
      );
    }
    const list = (await Promise.all(shifts.map((s) => serializeShift(s, req.user)))).map((s, i) => ({ ...s, respCount: 0 }));
    if (req.user.role === 'manager') {
      const cnt = await db.all(`SELECT shift_id, COUNT(*)::int n FROM responses GROUP BY shift_id`);
      for (const c of cnt) {
        const item = list.find((l) => l.id === c.shift_id);
        if (item) item.respCount = Number(c.n);
      }
    }
    const responseMap = new Map();
    if (req.user.role !== 'manager') {
      const rows = await db.all(`SELECT * FROM responses WHERE worker_id = $1 ORDER BY created_at DESC`, req.user.id);
      for (const r of rows) responseMap.set(r.shift_id, await serializeResponse(r));
    }
    res.json({
      shifts: list.map((s) => ({ ...s, myResponse: responseMap.get(s.id) || null })),
      feeRate: await currentFee(),
    });
  })
);

router.post('/:id/respond',
  authGuard(['chef', 'waiter']),
  asyncH(async (req, res) => {
    const { kind, amount } = req.body;
    if (!['accept', 'counter'].includes(kind)) throw apiError('Choose to accept or counter-offer.');
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.id);
    if (!shift) throw apiError('This shift no longer exists.');
    if (shift.status !== 'open') throw apiError('This shift is no longer accepting responses.');
    if (shift.manager_id === req.user.id) throw apiError('You cannot respond to your own shift.');
    if (shift.role !== req.user.role) throw apiError('This shift is not for your role.');
    if (shift.role === 'chef' && shift.specialty) {
      const p = await db.get(`SELECT specialties FROM chef_profiles WHERE user_id = $1`, req.user.id);
      const tags = p ? JSON.parse(p.specialties || '[]') : [];
      if (!tags.some((t) => String(t).toLowerCase() === String(shift.specialty).toLowerCase())) {
        throw apiError('This shift needs a different specialty than the ones on your profile.');
      }
    }
    const already = await db.get(`SELECT 1 FROM responses WHERE shift_id = $1 AND worker_id = $2`, shift.id, req.user.id);
    if (already) throw apiError('You already responded to this shift.');

    let amountN = null;
    if (kind === 'accept') amountN = shift.pay_max;
    else {
      amountN = Number(amount);
      if (!Number.isFinite(amountN) || amountN < shift.pay_min * 0.7 || amountN > shift.pay_max * 1.3) {
        throw apiError('Your counter-offer should stay close to the advertised pay range.');
      }
    }
    const id = uid('rsp');
    await db.run(
      `INSERT INTO responses (id, shift_id, worker_id, kind, amount, status, created_at) VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
      id, shift.id, req.user.id, kind, amountN, nowIso()
    );
    publish(EVENT.SHIFT_RESPONSE, [shift.manager_id], {
      shiftId: shift.id, responseId: id, kind, amount: amountN,
    });
    await notifyUser(shift.manager_id,
      'notif.newResponse.title',
      kind === 'accept' ? 'notif.newResponse.accepted' : 'notif.newResponse.countered',
      'new_response', { shiftId: shift.id, name: req.user.name, amount: amountN, role: shift.role });
    res.status(201).json({ response: await serializeResponse(await db.get(`SELECT * FROM responses WHERE id = $1`, id)) });
  })
);

router.post('/:id/accept',
  authGuard(['manager']),
  asyncH(async (req, res) => {
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.id);
    if (!shift || shift.manager_id !== req.user.id) throw apiError('This shift does not exist for you.');
    if (shift.status !== 'open') throw apiError('This shift is already locked in or closed.');
    const response = await db.get(`SELECT * FROM responses WHERE id = $1 AND shift_id = $2 AND status = 'pending'`, req.body.responseId, shift.id);
    if (!response) throw apiError('That response is no longer available.');

    const agreed = response.amount;
    const feeRate = await currentFee();
    const feeAmount = Math.round(agreed * feeRate * 100) / 100;
    const workerPayout = Math.round((agreed - feeAmount) * 100) / 100;

    await db.run(`UPDATE shifts SET status = 'matched', matched_worker_id = $1, agreed_pay = $2, matched_at = $3 WHERE id = $4`,
      response.worker_id, agreed, nowIso(), shift.id);
    await db.run(`UPDATE responses SET status = 'accepted' WHERE id = $1`, response.id);
    await db.run(`UPDATE responses SET status = 'declined' WHERE shift_id = $1 AND id != $2 AND status = 'pending'`, shift.id, response.id);
    await db.run(
      `INSERT INTO fee_records (shift_id, agreed_pay, fee_rate, fee_amount, worker_payout, settled, created_at) VALUES ($1,$2,$3,$4,$5,0,$6)`,
      shift.id, agreed, feeRate, feeAmount, workerPayout, nowIso()
    );
    // Commit the venue's money to escrow the moment the match is locked in.
    await openHold({
      shiftId: shift.id,
      managerId: shift.manager_id,
      workerId: response.worker_id,
      grossAmount: agreed,
    });
    await audit('shift_matched', `Shift ${shift.id} matched with pay $${agreed} (fee ${Math.round(feeRate*100)}% = $${feeAmount})`, req.user.id);

    const worker = await db.get(`SELECT * FROM users WHERE id = $1`, response.worker_id);
    await notifyUser(response.worker_id,
      'notif.gotShift.title', 'notif.gotShift.body',
      'shift_confirmed', { shiftId: shift.id, amount: agreed });
    await notifyUser(req.user.id, 'notif.shiftConfirmed.title', 'notif.shiftConfirmed.body',
      'shift_confirmed', { shiftId: shift.id, name: worker.name, amount: agreed });

    const fresh = await db.get(`SELECT * FROM shifts WHERE id = $1`, shift.id);
    res.json({ shift: await serializeShift(fresh, req.user), feeRate });
  })
);

router.post('/:id/rate',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.id);
    if (!shift || shift.status !== 'matched') throw apiError('You can only rate after the shift is confirmed.');
    const { stars, comment, toUserId } = req.body;
    const s = Number(stars);
    if (![1, 2, 3, 4, 5].includes(s)) throw apiError('Pick between 1 and 5 stars.');
    if (!toUserId) throw apiError('Missing rating target.');
    const isManager = req.user.id === shift.manager_id;
    const isWorker = req.user.id === shift.matched_worker_id;
    if (!isManager && !isWorker) throw apiError('You are not part of this shift.');
    if (!((isManager && toUserId === shift.matched_worker_id) || (isWorker && toUserId === shift.manager_id))) {
      throw apiError('You can only rate the other person on this shift.');
    }
    const existing = await db.get(`SELECT id FROM ratings WHERE shift_id = $1 AND from_user = $2`, shift.id, req.user.id);
    if (existing) throw apiError('You already rated this shift.');
    await db.run(
      `INSERT INTO ratings (id, shift_id, from_user, to_user, stars, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      uid('rat'), shift.id, req.user.id, toUserId, s, clean(comment, 300), nowIso()
    );
    res.status(201).json({ ok: true });
  })
);

router.get('/:id',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.id);
    if (!shift) throw apiError('This shift no longer exists.');
    const responses = await db.all(`SELECT * FROM responses WHERE shift_id = $1 ORDER BY created_at DESC`, shift.id);
    const canSeeResponses = req.user.role === 'manager' && shift.manager_id === req.user.id;
    const details = (() => {
      const base = { shift: null };
      return base;
    })();
    const feeRecord = shift.status === 'matched' ? await db.get(`SELECT * FROM fee_records WHERE shift_id = $1`, shift.id) : null;
    const ratings = await db.all(
      `SELECT r.*, fu.name from_name FROM ratings r JOIN users fu ON fu.id = r.from_user WHERE r.shift_id = $1`,
      shift.id
    );
    const myResponse = req.user.role !== 'manager'
      ? await (async () => {
          const mine = await db.get(`SELECT * FROM responses WHERE shift_id = $1 AND worker_id = $2`, shift.id, req.user.id);
          return mine ? await serializeResponse(mine) : null;
        })()
      : null;

    res.json({
      shift: await serializeShift(shift, req.user),
      feeRecord: feeRecord || undefined,
      responses: canSeeResponses ? await Promise.all(responses.map(serializeResponse)) : [],
      myResponse,
      feerate: await currentFee(),
      ratings,
      ratedByMe: ratings.some((r) => r.from_user === req.user.id),
      managerRated: shift.status === 'matched' && ratings.some((r) => r.from_user === shift.manager_id),
      workerRated: shift.status === 'matched' && ratings.some((r) => r.from_user === shift.matched_worker_id),
    });
  })
);

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Worker confirms arrival by quoting the proximity code the venue can see.
 * This is the check-in step in the confirmed-shift card.
 */
router.post('/:id/checkin',
  authGuard(['chef', 'waiter']),
  asyncH(async (req, res) => {
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.id);
    if (!shift) throw apiError('This shift no longer exists.');
    if (shift.matched_worker_id !== req.user.id) throw apiError('This is not your shift.', 403);
    if (shift.status !== 'matched') throw apiError('This shift is not confirmed.');
    if (shift.checked_in_at) return res.json({ checkedInAt: shift.checked_in_at });

    const code = String(req.body.code || '').trim();
    if (code !== proximityCode(shift.id)) throw apiError('That arrival code did not match.');

    const ts = nowIso();
    await db.run(`UPDATE shifts SET checked_in_at = $1 WHERE id = $2`, ts, shift.id);
    await notifyUser(shift.manager_id, 'notif.arrived.title', 'notif.arrived.body',
      'checkin', { shiftId: shift.id, name: req.user.name, venue: shift.location_name });
    await audit('shift_checkin', `Shift ${shift.id} check-in`, req.user.id);
    res.json({ checkedInAt: ts });
  })
);

/** Venue marks the service finished, which is what unlocks the payout step. */
router.post('/:id/complete',
  authGuard(['manager']),
  asyncH(async (req, res) => {
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.id);
    if (!shift) throw apiError('This shift no longer exists.');
    if (shift.manager_id !== req.user.id) throw apiError('This is not your shift.', 403);
    if (shift.status !== 'matched') throw apiError('This shift is not confirmed.');
    if (!shift.checked_in_at) throw apiError('The crew member has not checked in yet.');
    if (shift.completed_at) return res.json({ completedAt: shift.completed_at });

    const ts = nowIso();
    await db.run(`UPDATE shifts SET completed_at = $1 WHERE id = $2`, ts, shift.id);
    if (shift.matched_worker_id) {
      await notifyUser(shift.matched_worker_id, 'notif.complete.title', 'notif.complete.body',
        'complete', { shiftId: shift.id });
    }
    await audit('shift_complete', `Shift ${shift.id} marked complete`, req.user.id);
    res.json({ completedAt: ts });
  })
);

export default router;
