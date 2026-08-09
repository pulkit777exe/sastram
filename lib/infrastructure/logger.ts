import crypto from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = process.env.NODE_ENV === 'development';

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(12).toString('base64url')}`;
}

const REDACTED = '[REDACTED]';

const SECRET_KEY_RE = /^(?:.*(?:secret|token|password|apikey|api_key|authorization|cookie|signature|set-cookie|session|sessions|private|credential|cred))$/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LONG_OPAQUE_RE = /^[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}$/;

const BEARER_RE = /\bBearer\s+[A-Za-z0-9_\-\.]{8,}/gi;

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  const local = email.slice(0, at);
  return `${local[0] ?? ''}${'*'.repeat(Math.max(local.length - 1, 1))}${email.slice(at)}`;
}

// Nothing reaches console without passing through here — logs end up in Vercel/Sentry,
// so tokens, cookies and raw email addresses must never survive the trip.
export function scrub(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const out = value.replace(BEARER_RE, 'Bearer [REDACTED]');
    if (LONG_OPAQUE_RE.test(out)) return REDACTED;
    // Emails are masked rather than dropped so login flows stay debuggable.
    return EMAIL_RE.test(out) ? out.replace(EMAIL_RE, maskEmail) : out;
  }

  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => scrub(item, seen));

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (SECRET_KEY_RE.test(key)) {
      result[key] = REDACTED;
    } else if (key === 'metadata' && entry && typeof entry === 'object') {
      // `metadata` is caller-curated structured context; pass it through untouched.
      result[key] = entry;
    } else {
      result[key] = scrub(entry, seen);
    }
  }
  return result;
}

export function safeContext(args: unknown[]): unknown {
  if (args.length === 0) return {};
  try {
    return scrub(Object.assign({}, ...args.filter((a) => a && typeof a === 'object')));
  } catch {
    return '[unserializable context]';
  }
}

const CONSOLE_BY_LEVEL: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

class Logger {
  private log(level: LogLevel, message: string, ...args: unknown[]) {
    if (level === 'debug' && !isDevelopment) return;

    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
    CONSOLE_BY_LEVEL[level](prefix, message, safeContext(args));
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args);
  }
}

export const logger = new Logger();
