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

/**
 * Recursively scrub a value so secrets are never written to console output.
 * - Object keys matching secret patterns are replaced wholesale.
 * - Long JWT-like opaque strings in string values are replaced.
 * - `Authorization: Bearer ...` substrings in free-form text are replaced.
 * - Email values are partially masked to keep login flows debuggable without leaking addresses.
 */
function scrub(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let out = value.replace(BEARER_RE, 'Bearer [REDACTED]');
    if (EMAIL_RE.test(out)) {
      out = out.replace(EMAIL_RE, (m) => {
        const at = m.indexOf('@');
        const local = m.slice(0, at);
        const domain = m.slice(at);
        const head = local[0] ?? '';
        return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
      });
    }
    if (LONG_OPAQUE_RE.test(out)) {
      return REDACTED;
    }
    return out;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, seen));
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (SECRET_KEY_RE.test(key)) {
      result[key] = REDACTED;
    } else if (key === 'metadata' && record[key] && typeof record[key] === 'object') {
      result[key] = record[key];
    } else {
      result[key] = scrub(record[key], seen);
    }
  }
  return result;
}

function safeContext(args: unknown[]): unknown {
  if (args.length === 0) return {};
  try {
    const merged = Object.assign({}, ...args.filter((a) => a && typeof a === 'object'));
    return scrub(merged);
  } catch {
    return '[unserializable context]';
  }
}

class Logger {
  private log(level: LogLevel, message: string, ...args: unknown[]) {
    if (level === 'debug' && !isDevelopment) {
      return;
    }

    const timestamp = new Date().toISOString();
    const context = args.length > 0 ? safeContext(args) : {};

    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case 'error':
        console.error(prefix, message, context);
        break;
      case 'warn':
        console.warn(prefix, message, context);
        break;
      case 'info':
        console.info(prefix, message, context);
        break;
      case 'debug':
        console.log(prefix, message, context);
        break;
    }
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
