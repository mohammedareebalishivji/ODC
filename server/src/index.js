import { PORT } from './config.js';
import { app } from './app.js';
import { initDatabase } from './db.js';
import { configurePush } from './notify.js';
import { startJobs } from './jobs.js';
import { ensureAdmin, demoSeedAllowed } from './seed.js';

async function initDatabaseWithRetry() {
  const MAX_ATTEMPTS = 6;
  for (let attempt = 1; ; attempt++) {
    try {
      await initDatabase();
      return;
    } catch (err) {
      console.error(`[db] PostgreSQL not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
      if (attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function main() {
  // Listen immediately and warm the database in the background. A hosted
  // Postgres (Supabase) can take many seconds to accept a cold connection;
  // gating the listener on that previously left the API unresponsive (and the
  // dev proxy serving HTML 500s) for ~30s, or killed the process outright on a
  // connect timeout. Now the port is up at once and transient DB slowness is
  // retried instead of aborting the boot.
  const server = app.listen(PORT, () => {
    console.log(`ODC API listening on :${PORT} (database warming up in background)`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other O.D.C instance first, or run ./start.sh which handles this automatically.`);
      process.exit(1);
    }
    throw err;
  });

  try {
    await initDatabaseWithRetry();
  } catch (err) {
    console.error(`[fatal] Could not reach the database after repeated attempts: ${err.message}`);
    console.error('[db] The API stays up but requests will fail until the database is reachable. Restart to retry.');
    return;
  }

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
}

main().catch((err) => {
  console.error('[fatal] Failed to start:', err);
  process.exit(1);
});
