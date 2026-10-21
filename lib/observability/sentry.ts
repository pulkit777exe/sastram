import type { ErrorEvent, Log } from '@sentry/core';

const REDACTED = '[REDACTED]';
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const SECRET_KEYWORDS = [
  'secret',
  'token',
  'password',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'signature',
  'session',
  'credential',
];

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
}

export function scrubSentryText(value: string): string {
  return value.replace(EMAIL_RE, maskEmail);
}

function scrubAttributes(value: unknown): unknown {
  if (typeof value === 'string') return scrubSentryText(value);
  if (Array.isArray(value)) return value.map(scrubAttributes);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSecretKey(key) ? REDACTED : scrubAttributes(entry);
  }
  return result;
}

/**
 * Privacy-safe defaults shared by the browser, Node and Edge Sentry clients.
 *
 * Sentry's defaults collect request bodies, headers, cookies, query strings,
 * LLM payloads, database rows, and stack-frame local variables. Sastram handles
 * private threads and email OTPs, so none of those categories are safe to send
 * by default. Explicit `Sentry.capture*` calls still work.
 */
export const sentryPrivacyOptions = {
  // Kept for older SDK versions; dataCollection takes precedence on v10+.
  sendDefaultPii: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  beforeSend(event: ErrorEvent): ErrorEvent {
    // Defence in depth for SDK versions/integrations that ignore dataCollection.
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
      delete event.request.query_string;
    }
    delete event.user;
    return event;
  },
  beforeSendLog(log: Log): Log {
    log.message = scrubSentryText(log.message);
    if (log.attributes) {
      log.attributes = scrubAttributes(log.attributes) as Record<string, unknown>;
    }
    return log;
  },
};
