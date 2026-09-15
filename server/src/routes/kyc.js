import { Router } from 'express';
import { db, audit } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { uid, nowIso, apiError } from '../config.js';
import { notifyUser } from '../notify.js';

const router = Router();
const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const DOC_TYPES = ['aadhaar', 'pan', 'fssai', 'digilocker', 'other'];
// Base64 data URLs get big; cap well under the 1mb express json limit.
const MAX_FILE_CHARS = 700_000;

function serialize(d) {
  return {
    id: d.id,
    docType: d.doc_type,
    numberLast4: d.number_last4,
    status: d.status,
    reviewNote: d.review_note,
    createdAt: d.created_at,
    reviewedAt: d.reviewed_at,
  };
}

router.get(
  '/',
  authGuard(),
  asyncH(async (req, res) => {
    const rows = await db.all(
      `SELECT * FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC`,
      req.user.id
    );
    res.json({ documents: rows.map(serialize) });
  })
);

router.post(
  '/',
  authGuard(),
  asyncH(async (req, res) => {
    const docType = clean(req.body.docType, 20);
    if (!DOC_TYPES.includes(docType)) throw apiError('Choose a valid document type.');

    const number = clean(req.body.number, 32).replace(/\s/g, '');
    const fileData = typeof req.body.fileData === 'string' ? req.body.fileData : '';

    if (docType === 'aadhaar' && !/^\d{12}$/.test(number)) {
      throw apiError('Enter the 12-digit Aadhaar number.');
    }
    if (docType === 'pan' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(number.toUpperCase())) {
      throw apiError('Enter a valid PAN, for example ABCDE1234F.');
    }
    if (fileData && fileData.length > MAX_FILE_CHARS) {
      throw apiError('That file is too large. Please upload one under 500 KB.');
    }
    if (fileData && !/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(fileData)) {
      throw apiError('Upload a PNG, JPG, WEBP or PDF file.');
    }

    const id = uid('kyc');
    await db.run(
      `INSERT INTO kyc_documents
         (id, user_id, doc_type, number_last4, file_data, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
      // The full identifier is deliberately never persisted.
      id, req.user.id, docType, number ? number.slice(-4) : null, fileData || null, nowIso()
    );
    await audit('kyc.submitted', `doc=${id} type=${docType}`, req.user.id);
    res.status(201).json({ id, docType, status: 'pending' });
  })
);

/* ---------------- Admin verification queue ---------------- */

router.get(
  '/admin/queue',
  authGuard(['admin']),
  asyncH(async (_req, res) => {
    const rows = await db.all(
      `SELECT k.*, u.name, u.phone, u.role
         FROM kyc_documents k JOIN users u ON u.id = k.user_id
        WHERE k.status = 'pending'
        ORDER BY k.created_at`
    );
    res.json({
      documents: rows.map((d) => ({
        ...serialize(d),
        userId: d.user_id,
        userName: d.name,
        userRole: d.role,
      })),
    });
  })
);

router.get(
  '/admin/:id/file',
  authGuard(['admin']),
  asyncH(async (req, res) => {
    const doc = await db.get(`SELECT file_data FROM kyc_documents WHERE id = $1`, req.params.id);
    if (!doc) throw apiError('Document not found.', 404);
    await audit('kyc.file_viewed', `doc=${req.params.id}`, req.user.id);
    res.json({ fileData: doc.file_data });
  })
);

router.post(
  '/admin/:id/review',
  authGuard(['admin']),
  asyncH(async (req, res) => {
    const decision = clean(req.body.decision, 10);
    const note = clean(req.body.note, 500);
    if (!['verified', 'rejected'].includes(decision)) {
      throw apiError('Choose approve or reject.');
    }

    const doc = await db.get(`SELECT * FROM kyc_documents WHERE id = $1`, req.params.id);
    if (!doc) throw apiError('Document not found.', 404);

    await db.run(
      `UPDATE kyc_documents
          SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = $4
        WHERE id = $5`,
      decision, note, req.user.id, nowIso(), doc.id
    );

    // A verified Aadhaar is what earns the badge shown across the designs.
    if (decision === 'verified' && doc.doc_type === 'aadhaar') {
      await db.run(`UPDATE users SET verified_badge = 1 WHERE id = $1`, doc.user_id);
    }

    await notifyUser(
      doc.user_id,
      decision === 'verified' ? 'notif.kycApproved.title' : 'notif.kycRejected.title',
      note || (decision === 'verified' ? 'notif.kycApproved.body' : 'notif.kycRejected.body'),
      'kyc',
      { documentId: doc.id }
    );
    await audit('kyc.reviewed', `doc=${doc.id} → ${decision}`, req.user.id);
    res.json({ id: doc.id, status: decision });
  })
);

export default router;
