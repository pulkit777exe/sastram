export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

export function onRequestError() {
  console.error('[Sentry] Server error caught');
}