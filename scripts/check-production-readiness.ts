import 'dotenv/config';

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

function validUrl(name: string, options?: { productionHttps?: boolean }) {
  const value = env[name];
  let ok = false;
  let message = `${name} must be a valid URL`;

  try {
    if (value) {
      const url = new URL(value);
      ok = Boolean(url.protocol && url.host);
      if (options?.productionHttps && env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        ok = false;
        message = `${name} must use https in production`;
      }
    }
  } catch {
    ok = false;
  }

  checks.push({ name, ok, message, severity: 'error' });
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

required('DATABASE_URL');
required('BETTER_AUTH_SECRET', 32);
required('CRON_SECRET', 32);
required('RESEND_API_KEY');
required('RESEND_TEMPLATE_OTP');
required('RESEND_TEMPLATE_INVITATION');
required('RESEND_TEMPLATE_THREAD_SUMMARY');
required('RESEND_TEMPLATE_PASSWORD_RESET');
required('RESEND_TEMPLATE_WELCOME');

validUrl('BETTER_AUTH_URL', { productionHttps: true });
validUrl('NEXT_PUBLIC_APP_URL', { productionHttps: true });

pair('upstash-rest', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
pair('qstash-signing', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY');
pair('qstash-publish', 'QSTASH_URL', 'QSTASH_TOKEN');

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
warning(
  'ai-provider-key',
  aiProviderKeyOk,
  `AI_PROVIDER=${env.AI_PROVIDER ?? 'gemini'} has no matching provider key; AI features will be disabled`,
);

warning(
  'neon-pooling',
  !env.DATABASE_URL?.includes('neon.tech') || env.DATABASE_URL.includes('pgbouncer=true'),
  'Neon production DATABASE_URL should include pgbouncer=true for pooled app traffic',
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
