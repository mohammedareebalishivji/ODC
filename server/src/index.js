import { PORT, DEV } from './config.js';
import { app } from './app.js';
import { initDatabase } from './db.js';
import { configurePush } from './notify.js';
import { startJobs } from './jobs.js';
import { ensureAdmin } from './seed.js';

async function main() {
  await initDatabase();
  await ensureAdmin();
  await configurePush();
  startJobs();

  if (DEV) {
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
