import '@/lib/config/env';

import { startAllWorkers, stopAllWorkers } from '@/lib/queue';
import { logger } from '@/lib/infrastructure/logger';

async function main() {
  logger.info('[worker] Starting standalone worker process');

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  startAllWorkers();

  logger.info('[worker] All workers registered. Process will run until terminated.');
}

async function gracefulShutdown() {
  logger.info('[worker] Shutdown signal received, draining workers...');
  try {
    await stopAllWorkers();
    logger.info('[worker] Workers shut down gracefully');
  } catch (err) {
    logger.error('[worker] Error during shutdown', { error: String(err) });
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error('[worker] Fatal error starting worker process', { error: String(err) });
  process.exit(1);
});
