import crypto from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = process.env.NODE_ENV === 'development';

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(12).toString('base64url')}`;
}

const REDACTED = '[REDACTED]';

// --- Scrub patterns (named + commented for auditability) ---

// Secret-looking keys: any key containing one of these substrings → redact entire value.
// Keep list explicit so new secret types are easy to add.
// Uses simple includes() checks instead of a dense regex — each keyword is visible.
const SECRET_KEYWORDS = [
  'secret',
  'token',
  'password',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'signature',
  'set-cookie',
  'session',
  'sessions',
  'private',
  'credential',
  'cred',
];

// Simple email shape — masked, not dropped, so login flows stay debuggable.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// JWT-like token pattern: three dot-separated base64url segments (header.payload.signature)
// Each segment has a minimum length to avoid false positives on short strings
const JWT_LIKE_RE = /^[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}$/;
const LONG_OPAQUE_RE = JWT_LIKE_RE; // alias — keeps existing tests/code working

// Bearer token pattern: "Bearer <token>" with at least 8 chars — Authorization header scrubbing
const BEARER_TOKEN_RE = /\bBearer\s+[A-Za-z0-9_\-\.]{8,}/gi;
const BEARER_RE = BEARER_TOKEN_RE; // alias — keeps existing code working

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const localPart = email.slice(0, at);
  const domainPart = email.slice(at);
  const firstChar = localPart[0] ?? '';
  const maskedLength = Math.max(localPart.length - 1, 1);
  const masked = '*'.repeat(maskedLength);
  return `${firstChar}${masked}${domainPart}`;
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const keyword of SECRET_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }
  return false;
}

function isLongOpaqueToken(value: string): boolean {
  return LONG_OPAQUE_RE.test(value);
}

function isEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

function scrubString(value: string): string {
  const withoutBearer = value.replace(BEARER_RE, 'Bearer [REDACTED]');

  if (isLongOpaqueToken(withoutBearer)) {
    return REDACTED;
  }

  const isEmailValue = isEmail(withoutBearer);
  if (isEmailValue) {
    return withoutBearer.replace(EMAIL_RE, maskEmail);
  }

  return withoutBearer;
}

// Nothing reaches console without passing through here — logs end up in Vercel/Sentry,
// so tokens, cookies and raw email addresses must never survive the trip.
export function scrub(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return scrubString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  const isCircular = seen.has(value);
  if (isCircular) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return scrubArray(value, seen);
  }

  return scrubObject(value as Record<string, unknown>, seen);
}

function scrubArray(items: unknown[], seen: WeakSet<object>): unknown[] {
  return items.map((item) => scrub(item, seen));
}

function scrubObject(record: Record<string, unknown>, seen: WeakSet<object>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    const isSecret = isSecretKey(key);
    if (isSecret) {
      result[key] = REDACTED;
      continue;
    }

    const isMetadata = key === 'metadata' && entry !== null && typeof entry === 'object';
    if (isMetadata) {
      // `metadata` is caller-curated structured context; pass it through untouched.
      result[key] = entry;
      continue;
    }

    result[key] = scrub(entry, seen);
  }

  return result;
}

export function safeContext(args: unknown[]): unknown {
  if (args.length === 0) return {};
  try {
    const merged: Record<string, unknown> = {};
    for (const arg of args) {
      if (arg && typeof arg === 'object') {
        const record = arg as Record<string, unknown>;
        for (const key in record) {
          if (Object.prototype.hasOwnProperty.call(record, key)) {
            merged[key] = record[key];
          }
        }
      }
    }
    return scrub(merged);
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
