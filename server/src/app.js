import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFeeRate } from './db.js';
import { nowIso } from './config.js';
import { errorHandler, bodyGuard } from './middleware.js';

import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import shiftRoutes from './routes/shifts.js';
import adminRoutes from './routes/admin.js';
import paymentRoutes from './routes/payments.js';
import chatRoutes from './routes/chat.js';
import disputeRoutes from './routes/disputes.js';
import kycRoutes from './routes/kyc.js';
import eventRoutes from './routes/events.js';
import presenceRoutes from './routes/presence.js';
import webhookRoutes from './routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
/*
 * Keep the raw bytes for webhook routes only.
 *
 * A provider signs the exact body it sent, so the signature has to be checked
 * against those bytes. Re-serialising req.body would change key order or
 * whitespace and fail verification in a way that looks like an attack rather
 * than a bug. Scoped to the webhook path so ordinary requests do not each
 * retain a second copy of their body.
 */
const WEBHOOK_PREFIX = '/api/payments/webhook';
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith(WEBHOOK_PREFIX)) req.rawBody = buf;
  },
}));
app.use(bodyGuard);

app.get('/health', async (_req, res) => res.json({ ok: true, feeRate: await getFeeRate(), time: nowIso() }));

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/shifts', shiftRoutes);
// Before the authenticated payment routes: a provider callback carries a
// signature, not a bearer token, so it must not meet authGuard.
app.use(WEBHOOK_PREFIX, webhookRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/presence', presenceRoutes);

// Super Admin lives ONLY on a private, unlisted path — never a public /api/admin.
app.use('/tail/z7k9x2/admin', adminRoutes);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!tail).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

export { app };
