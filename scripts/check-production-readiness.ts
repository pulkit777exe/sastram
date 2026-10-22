import 'dotenv/config';
import { validateEnv } from '@/lib/config/env';

type Check = {
  name: string;
  ok: boolean;
  message: string;
  severity: 'error' | 'warning';
};

const env = process.env;
const checks: Check[] = [];

function required(name: string, minLength = 1) {
  const value = env[name];
  let message = `${name} must be set`;
  if (minLength > 1) {
    message = `${name} must be at least ${minLength} characters`;
  }
  checks.push({
    name,
    ok: typeof value === 'string' && value.trim().length >= minLength,
    message,
    severity: 'error',
  });
}

function requireHttps(name: string) {
  // Deployment check: schema owns URL validity; only the prod-https rule
  // lives here since local dev is legitimately http.
  const value = env[name];
  let ok = Boolean(value);
  try {
    if (value && env.NODE_ENV === 'production') {
      ok = new URL(value).protocol === 'https:';
    }
  } catch {
    ok = false;
  }
  checks.push({
    name: `${name}-https`,
    ok,
    message: `${name} must be set to an https URL in production`,
    severity: 'error',
  });
}

function pair(name: string, a: string, b: string) {
  const hasA = Boolean(env[a]);
  const hasB = Boolean(env[b]);
  checks.push({
    name,
    ok: hasA === hasB,
    message: `${a} and ${b} must be configured together`,
    severity: 'error',
  });
}

function warning(name: string, ok: boolean, message: string) {
  checks.push({ name, ok, message, severity: 'warning' });
}

// Base verdict comes from the single env seam (lib/config/env.ts) — the
// schema owns required keys, URL shapes, and length minimums. What stays here
// is deployment knowledge the schema deliberately does not own: prod-only
// secrets, key pairs that must travel together, and hosting heuristics.
const schemaResult = validateEnv();
if (!schemaResult.success) {
  for (const issue of schemaResult.error.issues) {
    const path = issue.path.join('.');
    checks.push({
      name: path.length > 0 ? path : 'env',
      ok: false,
      message: issue.message,
      severity: 'error',
    });
  }
}

// Prod crons must be authenticated; local dev may omit CRON_SECRET entirely
// (schema leaves it optional), so this stays a deployment check.
required('CRON_SECRET', 32);
required('NEXT_PUBLIC_APP_URL');

requireHttps('BETTER_AUTH_URL');
requireHttps('NEXT_PUBLIC_APP_URL');

pair('upstash-rest', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
pair('qstash-signing', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY');
pair('qstash-publish', 'QSTASH_URL', 'QSTASH_TOKEN');
// Streamlit-style single-process deploys can run without Redis, but a
// production deployment must have shared rate limits/quotas. Without this,
// every serverless instance gets its own limiter and spend cap.
required('UPSTASH_REDIS_REST_URL');
required('UPSTASH_REDIS_REST_TOKEN');

const usesQstash = Boolean(env.QSTASH_URL || env.QSTASH_TOKEN);
checks.push({
  name: 'qstash-receiver',
  ok: !usesQstash || Boolean(env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY),
  message: 'QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY are required when publishing to QStash',
  severity: 'error',
});
checks.push({
  name: 'qstash-dev',
  ok: env.QSTASH_DEV !== 'true' && env.QSTASH_DEV !== '1',
  message: 'QSTASH_DEV must be disabled in production',
  severity: 'error',
});

warning(
  'auth-url-match',
  !env.BETTER_AUTH_URL || !env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL === env.NEXT_PUBLIC_APP_URL,
  'BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL should normally match',
);

let aiProviderKeyOk: boolean;
if (env.AI_PROVIDER === 'openai') {
  aiProviderKeyOk = Boolean(env.OPENAI_API_KEY);
} else {
  aiProviderKeyOk = Boolean(env.GEMINI_API_KEY);
}
const moderationOptedOut =
  env.CONTENT_MODERATION_ENABLED === 'false' || env.CONTENT_MODERATION_ENABLED === '0';
const moderationEnabled = !moderationOptedOut;
checks.push({
  name: 'ai-moderation-provider-key',
  ok: aiProviderKeyOk || !moderationEnabled,
  message: moderationEnabled
    ? `AI_PROVIDER=${env.AI_PROVIDER ?? 'gemini'} has no matching provider key; content moderation is enabled (the production default) and readiness would stay degraded`
    : 'Content moderation is disabled; no AI provider key is required',
  // Production defaults moderation on, so a missing key is a release blocker,
  // not a warning that operators can miss.
  severity: moderationEnabled ? 'error' : 'warning',
});

const databaseUrl = env.DATABASE_URL ?? '';
const isNeon = databaseUrl.includes('neon.tech');
const isPooledHost = databaseUrl.includes('-pooler.');
const isPgbouncerFlagged = databaseUrl.includes('pgbouncer=true');
const unpooledUrl = env.DATABASE_URL_UNPOOLED ?? '';

warning(
  'neon-pooling',
  !isNeon || isPooledHost || isPgbouncerFlagged,
  'Neon production DATABASE_URL should use the pooled (-pooler host or pgbouncer=true) endpoint for app traffic',
);

warning(
  'neon-migrations-direct',
  !isNeon || Boolean(unpooledUrl) || !(isPooledHost || isPgbouncerFlagged),
  'Neon migrations run over the pooled connection; set DATABASE_URL_UNPOOLED to the direct endpoint',
);

const failures = checks.filter((check) => !check.ok && check.severity === 'error');
const warnings = checks.filter((check) => !check.ok && check.severity === 'warning');

for (const check of checks) {
  let icon: string;
  if (check.ok) {
    icon = 'PASS';
  } else if (check.severity === 'error') {
    icon = 'FAIL';
  } else {
    icon = 'WARN';
  }
  let statusText: string;
  if (check.ok) {
    statusText = 'ok';
  } else {
    statusText = check.message;
  }
  console.log(`${icon} ${check.name}: ${statusText}`);
}

if (warnings.length > 0) {
  const plural = warnings.length === 1 ? '' : 's';
  console.log(`\n${warnings.length} warning${plural} need review.`);
}

if (failures.length > 0) {
  const plural = failures.length === 1 ? '' : 's';
  console.error(`\nProduction readiness failed with ${failures.length} error${plural}.`);
  process.exit(1);
}

console.log('\nProduction readiness checks passed.');
