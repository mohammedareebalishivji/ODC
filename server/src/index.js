import { PORT, DEV, DATABASE_URL } from './config.js';
import { app } from './app.js';
import { initDatabase } from './db.js';
import { configurePush } from './notify.js';
import { startJobs } from './jobs.js';
import { ensureAdmin } from './seed.js';

/**
 * Demo/test accounts share one published password (Test@1234), so they must
 * never be created in a hosted database. NODE_ENV alone is not enough of a
 * guard: pointing a local dev server at Supabase would otherwise seed them
 * straight into the cloud. Require an explicit opt-in for a remote host.
 */
function demoSeedAllowed() {
  if (!DEV) return false;
  let host = '';
  try { host = new URL(DATABASE_URL).hostname; } catch { /* treat as local */ }
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocal) return true;
  if (process.env.ODC_ALLOW_REMOTE_DEMO_SEED === 'yes') {
    console.warn(`[seed] WARNING: seeding demo accounts into remote host ${host} (explicitly allowed).`);
    return true;
  }
  console.log(`[seed] Skipped demo/test accounts — ${host} is not a local database.`);
  console.log('[seed] Set ODC_ALLOW_REMOTE_DEMO_SEED=yes to override (not recommended).');
  return false;
}

async function main() {
  await initDatabase();
  await ensureAdmin();
  await configurePush();
  startJobs();

  if (demoSeedAllowed()) {
    const { seedDemo, seedTestAccounts } = await import('./seed.js');
    const n = await seedDemo();
    if (n) console.log(`[seed] Created ${n} demo account(s).`);
    await seedTestAccounts();
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
}

main().catch((err) => {
  console.error('[fatal] Failed to start:', err);
  process.exit(1);
});
