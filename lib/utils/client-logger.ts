/**
 * Client-side logger.
 *
 * Thin wrapper around console that adds structured context.
 * In production, consider wiring to Sentry/BugSnag/browser Perfetto.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emit(level: LogLevel, tag: string, message: string, data?: unknown) {
  const prefix = `[${tag}]`;
  const payload = data !== undefined ? { message: data } : undefined;

  switch (level) {
    case 'debug':
      console.debug(prefix, message, payload);
      break;
    case 'info':
      console.info(prefix, message, payload);
      break;
    case 'warn':
      console.warn(prefix, message, payload);
      break;
    case 'error':
      console.error(prefix, message, payload);
      break;
  }
}

export const clientLogger = {
  debug: (tag: string, message: string, data?: unknown) => emit('debug', tag, message, data),
  info: (tag: string, message: string, data?: unknown) => emit('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => emit('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => emit('error', tag, message, data),
};
