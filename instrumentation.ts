export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    if (process.env.QUEUE_WORKERS_ENABLED !== 'false') {
      const { startAllWorkers, stopAllWorkers } = await import('./lib/queue');
      startAllWorkers();

      const shutdown = async () => {
        await stopAllWorkers();
        process.exit(0);
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    }
  }
}

export function onRequestError() {
  // handled by Sentry
}
