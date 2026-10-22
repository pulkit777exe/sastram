import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fail fast on invalid configuration instead of starting a process that
    // returns 500s until the orchestrator gives up. This runs once per server.
    const { getEnv } = await import('./lib/config/env');
    getEnv();
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Next calls this for uncaught route/RSC errors; without it, server-side
// failures never reach Sentry even though route handlers are instrumented.
export const onRequestError = Sentry.captureRequestError;
