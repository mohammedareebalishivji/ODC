import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, DEV, nowIso } from './config.js';
import { db, getFeeRate } from './db.js';
import { configurePush } from './notify.js';
import { startJobs } from './jobs.js';
import { ensureAdmin } from './seed.js';
import { errorHandler, bodyGuard } from './middleware.js';

import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import shiftRoutes from './routes/shifts.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(bodyGuard);

app.get('/health', (_req, res) => res.json({ ok: true, feeRate: getFeeRate(), time: nowIso() }));

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/shifts', shiftRoutes);

// Super Admin lives ONLY on a private, unlisted path — never a public /api/admin.
app.use('/tail/z7k9x2/admin', adminRoutes);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!tail).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

ensureAdmin();
configurePush();
startJobs();

if (DEV) {
  const { seedDemo, seedTestAccounts } = await import('./seed.js');
  const n = seedDemo();
  if (n) console.log(`[seed] Created ${n} demo account(s).`);
  seedTestAccounts();
  console.log('[seed] Test accounts ready: manager / chef / waiter / superadmin (password: Test@1234).');
}

const server = app.listen(PORT, () => {
  console.log(`ODC API listening on :${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other O.D.C instance first, or run ./start.sh which handles this automatically.`);
    process.exit(1);
  }
  throw err;
});