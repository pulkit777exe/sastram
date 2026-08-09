type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emit(level: LogLevel, tag: string, message: string, data?: unknown) {
  console[level](`[${tag}]`, message, data !== undefined ? { message: data } : undefined);
}

export const clientLogger = {
  debug: (tag: string, message: string, data?: unknown) => emit('debug', tag, message, data),
  info: (tag: string, message: string, data?: unknown) => emit('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => emit('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => emit('error', tag, message, data),
};
