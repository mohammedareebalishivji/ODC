import { Router } from 'express';
import { db, getFeeRate, audit } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { uid, nowIso, apiError } from '../config.js';
import { notifyUser, notifyMatchingWorkers } from '../notify.js';

const router = Router();

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

function serializeShift(s, viewer) {
  const manager = db.prepare(`SELECT * FROM users WHERE id = ?`).get(s.manager_id);
  const business = manager ? db.prepare(`SELECT * FROM manager_profiles WHERE user_id = ?`).get(manager.id) : null;
  const worker = s.matched_worker_id ? db.prepare(`SELECT * FROM users WHERE id = ?`).get(s.matched_worker_id) : null;
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
    viewerIsManager: viewer && viewer.id === s.manager_id,
    viewerIsWorker: viewer && s.matched_worker_id === viewer.id,
  };
}

function serializeResponse(r) {
  const worker = db.prepare(`SELECT * FROM users WHERE id = ?`).get(r.worker_id);
  const avg = db.prepare(`SELECT AVG(stars) avg, COUNT(*) n FROM ratings WHERE to_user = ?`).get(r.worker_id);
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

    const id = uid('shf');
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    db.prepare(
      `INSERT INTO shifts (id, manager_id, role, specialty, date, start_min, end_min, location_name, lat, lng, pay_min, pay_max, notes, dress_code, status, created_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?)`
    ).run(id, req.user.id, role, specialty || null, date, startMin, endMin,
          clean(locationName, 140), Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null,
          payMinN, payMaxN, clean(notes, 600), clean(dressCode, 140), createdAt, expiresAt);

    audit('shift_posted', `Shift ${id} posted for ${role}${specialty ? '/' + specialty : ''}`, req.user.id);
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(id);
    notifyMatchingWorkers(shift);
    notifyUser(req.user.id, 'Shift posted', 'We\u2019ll let you know when someone responds.', 'shift_posted', { shiftId: id });

    res.status(201).json({ shift: serializeShift(shift, req.user) });
  })
);

router.get('/open',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    const u = req.user;
    let rows = db.prepare(
      `SELECT * FROM shifts WHERE status = 'open' AND role = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 100`
    ).all(u.role, new Date().toISOString());

    const specMap = u.role === 'chef' ? (() => {
      const p = db.prepare(`SELECT specialties FROM chef_profiles WHERE user_id = ?`).get(u.id);
      return new Set((p ? JSON.parse(p.specialties || '[]') : []).map((t) => String(t).toLowerCase()));
    })() : null;

    const owned = new Set(db.prepare(`SELECT shift_id FROM responses WHERE worker_id = ?`).all(u.id).map((r) => r.shift_id));

    rows = rows.filter((s) => {
      if (owned.has(s.id)) return false;
      if (s.role === 'chef' && s.specialty && !specMap.has(String(s.specialty).toLowerCase())) return false;
      const { lat, lng } = s;
      if (Number.isFinite(req.query.lat)) {
        const dLat = lat === null ? Infinity : Math.abs(lat - req.query.lat);
        const dLng = lng === null ? Infinity : Math.abs(lng - req.query.lng);
        if (Math.max(dLat, dLng) > 0.3) return false;
      }
      return true;
    });
    res.json({ shifts: rows.map((s) => serializeShift(s, u)) });
  })
);

router.get('/my',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    let shifts = [];
    if (req.user.role === 'manager') {
      shifts = db.prepare(
        `SELECT * FROM shifts WHERE manager_id = ? ORDER BY created_at DESC LIMIT 200`
      ).all(req.user.id);
    } else {
      shifts = db.prepare(
        `SELECT DISTINCT s.* FROM shifts s JOIN responses r ON r.shift_id = s.id WHERE r.worker_id = ? ORDER BY s.created_at DESC LIMIT 200`
      ).all(req.user.id);
    }
    const list = shifts.map((s) => ({ ...serializeShift(s, req.user), respCount: 0 }));
    if (req.user.role === 'manager') {
      const cnt = db.prepare(`SELECT shift_id, COUNT(*) n FROM responses GROUP BY shift_id`).all();
      for (const c of cnt) {
        const item = list.find((l) => l.id === c.shift_id);
        if (item) item.respCount = c.n;
      }
    }
    const responseMap = new Map();
    if (req.user.role !== 'manager') {
      const rows = db.prepare(`SELECT * FROM responses WHERE worker_id = ? ORDER BY created_at DESC`).all(req.user.id);
      for (const r of rows) responseMap.set(r.shift_id, serializeResponse(r));
    }
    res.json({
      shifts: list.map((s) => ({ ...s, myResponse: responseMap.get(s.id) || null })),
      feeRate: currentFee(),
    });
  })
);

router.post('/:id/respond',
  authGuard(['chef', 'waiter']),
  asyncH(async (req, res) => {
    const { kind, amount } = req.body;
    if (!['accept', 'counter'].includes(kind)) throw apiError('Choose to accept or counter-offer.');
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(req.params.id);
    if (!shift) throw apiError('This shift no longer exists.');
    if (shift.status !== 'open') throw apiError('This shift is no longer accepting responses.');
    if (shift.manager_id === req.user.id) throw apiError('You cannot respond to your own shift.');
    if (shift.role !== req.user.role) throw apiError('This shift is not for your role.');
    if (shift.role === 'chef' && shift.specialty) {
      const p = db.prepare(`SELECT specialties FROM chef_profiles WHERE user_id = ?`).get(req.user.id);
      const tags = p ? JSON.parse(p.specialties || '[]') : [];
      if (!tags.some((t) => String(t).toLowerCase() === String(shift.specialty).toLowerCase())) {
        throw apiError('This shift needs a different specialty than the ones on your profile.');
      }
    }
    const already = db.prepare(`SELECT 1 FROM responses WHERE shift_id = ? AND worker_id = ?`).get(shift.id, req.user.id);
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
    db.prepare(
      `INSERT INTO responses (id, shift_id, worker_id, kind, amount, status, created_at) VALUES (?,?,?,?,?,'pending',?)`
    ).run(id, shift.id, req.user.id, kind, amountN, nowIso());
    notifyUser(shift.manager_id,
      `${req.user.name} responded`,
      kind === 'accept' ? `${capitalize(shift.role)} accepted. Pay: $${amountN}.` : `Counter-offer of $${amountN} on a ${shift.role} shift.`,
      'new_response', { shiftId: shift.id });
    const fresh = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shift.id);
    res.status(201).json({ response: serializeResponse(db.prepare(`SELECT * FROM responses WHERE id = ?`).get(id)) });
  })
);

router.post('/:id/accept',
  authGuard(['manager']),
  asyncH(async (req, res) => {
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(req.params.id);
    if (!shift || shift.manager_id !== req.user.id) throw apiError('This shift does not exist for you.');
    if (shift.status !== 'open') throw apiError('This shift is already locked in or closed.');
    const response = db.prepare(`SELECT * FROM responses WHERE id = ? AND shift_id = ? AND status = 'pending'`).get(req.body.responseId, shift.id);
    if (!response) throw apiError('That response is no longer available.');

    const agreed = response.amount;
    const feeRate = currentFee();
    const feeAmount = Math.round(agreed * feeRate * 100) / 100;
    const workerPayout = Math.round((agreed - feeAmount) * 100) / 100;

    db.prepare(`UPDATE shifts SET status = 'matched', matched_worker_id = ?, agreed_pay = ?, matched_at = ? WHERE id = ?`)
      .run(response.worker_id, agreed, nowIso(), shift.id);
    db.prepare(`UPDATE responses SET status = 'accepted' WHERE id = ?`).run(response.id);
    db.prepare(`UPDATE responses SET status = 'declined' WHERE shift_id = ? AND id != ? AND status = 'pending'`).run(shift.id, response.id);
    db.prepare(
      `INSERT INTO fee_records (shift_id, agreed_pay, fee_rate, fee_amount, worker_payout, settled, created_at) VALUES (?,?,?,?,?,0,?)`
    ).run(shift.id, agreed, feeRate, feeAmount, workerPayout, nowIso());
    audit('shift_matched', `Shift ${shift.id} matched with pay $${agreed} (fee ${Math.round(feeRate*100)}% = $${feeAmount})`, req.user.id);

    const worker = db.prepare(`SELECT * FROM users WHERE id = ?`).get(response.worker_id);
    notifyUser(response.worker_id,
      'You got the shift',
      `Locked in: $${agreed}. The manager has your contact. See details in My Work.`,
      'shift_confirmed', { shiftId: shift.id });
    notifyUser(req.user.id, 'Shift confirmed',
      `${worker.name} is confirmed for $${agreed}. They can see your contact info now.`, 'shift_confirmed', { shiftId: shift.id });

    const fresh = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shift.id);
    res.json({ shift: serializeShift(fresh, req.user), feeRate });
  })
);

router.post('/:id/rate',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(req.params.id);
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
    const existing = db.prepare(`SELECT id FROM ratings WHERE shift_id = ? AND from_user = ?`).get(shift.id, req.user.id);
    if (existing) throw apiError('You already rated this shift.');
    db.prepare(
      `INSERT INTO ratings (id, shift_id, from_user, to_user, stars, comment, created_at) VALUES (?,?,?,?,?,?,?)`
    ).run(uid('rat'), shift.id, req.user.id, toUserId, s, clean(comment, 300), nowIso());
    res.status(201).json({ ok: true });
  })
);

router.get('/:id',
  authGuard(publicRoles),
  asyncH(async (req, res) => {
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(req.params.id);
    if (!shift) throw apiError('This shift no longer exists.');
    const responses = db.prepare(`SELECT * FROM responses WHERE shift_id = ? ORDER BY created_at DESC`).all(shift.id);
    const canSeeResponses = req.user.role === 'manager' && shift.manager_id === req.user.id;
    const details = (() => {
      const base = { shift: serializeShift(shift, req.user) };
      if (shift.status === 'matched') {
        const fee = db.prepare(`SELECT * FROM fee_records WHERE shift_id = ?`).get(shift.id);
        if (fee) Object.assign(base, { feeRecord: fee });
      }
      return base;
    })();
    const ratings = db.prepare(
      `SELECT r.*, fu.name from_name FROM ratings r JOIN users fu ON fu.id = r.from_user WHERE r.shift_id = ?`
    ).all(shift.id);
    res.json({
      ...details,
      responses: canSeeResponses ? responses.map(serializeResponse) : [],
      myResponse: req.user.role !== 'manager'
        ? (() => {
            const mine = db.prepare(`SELECT * FROM responses WHERE shift_id = ? AND worker_id = ?`).get(shift.id, req.user.id);
            return mine ? serializeResponse(mine) : null;
          })()
        : null,
      feerate: currentFee(),
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

export default router;