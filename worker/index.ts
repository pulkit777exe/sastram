/**
 * Dedicated BullMQ worker process (for non-Vercel deployments).
 *
 * When using Vercel, workers are started automatically via the
 * instrumentation.ts hook. This separate process is only needed
 * when running a standalone Node.js server (e.g. via `pnpm dev:worker`).
 */
import { startAllWorkers, stopAllWorkers, closeRedisConnection, closeAllQueues } from '../lib/queue';
import { logger } from '../lib/infrastructure/logger';

async function main() {
  logger.info('Starting BullMQ worker process...');

  try {
    startAllWorkers();
    logger.info('BullMQ worker process ready');
  } catch (err) {
    logger.error('Failed to start workers', { error: String(err) });
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`Worker shutdown signal received: ${signal}`);

  try {
    await stopAllWorkers();
    await closeAllQueues();
    await closeRedisConnection();
    logger.info('BullMQ worker process shut down cleanly');
  } catch (err) {
    logger.error('Error during worker shutdown', { error: String(err) });
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void main();
