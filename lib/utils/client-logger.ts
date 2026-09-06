type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emit(level: LogLevel, logTag: string, logMessage: string, logData?: unknown) {
  let wrappedData: { message: unknown } | undefined = undefined;
  if (logData !== undefined) {
    wrappedData = { message: logData };
  }
  console[level](`[${logTag}]`, logMessage, wrappedData);
}

export const clientLogger = {
  debug: (logTag: string, logMessage: string, logData?: unknown) => emit('debug', logTag, logMessage, logData),
  info: (logTag: string, logMessage: string, logData?: unknown) => emit('info', logTag, logMessage, logData),
  warn: (logTag: string, logMessage: string, logData?: unknown) => emit('warn', logTag, logMessage, logData),
  error: (logTag: string, logMessage: string, logData?: unknown) => emit('error', logTag, logMessage, logData),
};
