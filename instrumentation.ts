export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    const { startAllWorkers } = await import('@/lib/queue');
    const { logger } = await import('@/lib/infrastructure/logger');

    const shouldStartWorkers = process.env.QUEUE_WORKERS_ENABLED !== 'false';

    if (shouldStartWorkers) {
      logger.info('[instrumentation] Starting BullMQ workers via instrumentation hook');
      try {
        startAllWorkers();
        logger.info('[instrumentation] BullMQ workers started successfully');
      } catch (err) {
        logger.error('[instrumentation] Failed to start BullMQ workers', { error: String(err) });
      }
    } else {
      logger.info('[instrumentation] BullMQ workers disabled via QUEUE_WORKERS_ENABLED=false');
    }
  }
}

export function onRequestError() {
  // handled by Sentry
}
