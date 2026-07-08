import { z } from 'zod';

/**
 * Environment variable validation schema
 * This ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server configuration
  PORT: z.string().default('3000').transform(Number),

  // Database — Neon serverless requires pgbouncer=true for connection pooling.
  // Without it, each serverless function opens a direct connection, exhausting Neon's limit.
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),

  // Redis (rate limiting, queues, caching)
  REDIS_URL: z.url('REDIS_URL must be a valid URL').optional(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),

  // OAuth - GitHub
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADMIN_ID: z.string().optional(),
  GOOGLE_ADMIN_SECRET: z.string().optional(),

  // Vercel Blob Storage
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Public URLs
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  NEXT_PUBLIC_OPENAI_API_KEY: z.string().optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_FROM: z.string().default('Sastram <noreply@sastram.wtfpulkit.dev>'),
  RESEND_TEMPLATE_OTP: z.string().min(1, 'RESEND_TEMPLATE_OTP is required'),
  RESEND_TEMPLATE_INVITATION: z.string().min(1, 'RESEND_TEMPLATE_INVITATION is required'),
  RESEND_TEMPLATE_THREAD_SUMMARY: z.string().min(1, 'RESEND_TEMPLATE_THREAD_SUMMARY is required'),
  RESEND_TEMPLATE_PASSWORD_RESET: z.string().min(1, 'RESEND_TEMPLATE_PASSWORD_RESET is required'),
  RESEND_TEMPLATE_WELCOME: z.string().min(1, 'RESEND_TEMPLATE_WELCOME is required'),

  // AI Providers
  GEMINI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),

  // AWS S3 (optional, for alternative file storage)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Realtime / WebSocket
  WEBSOCKET_URL: z.string().url('WEBSOCKET_URL must be a valid URL').optional(),

  // Security / sessions
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters').optional(),

  // QStash (background jobs)
  QSTASH_URL: z.string().url('QSTASH_URL must be a valid URL').optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

  // Feature flags
  RATE_LIMIT_ENABLED: z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform(v => v === true || v === 'true' || v === '1').default(true),
  CONTENT_MODERATION_ENABLED: z.coerce.boolean().default(false),

  // Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Limits
  MAX_FILE_UPLOAD_MB: z.coerce.number().int().positive().default(10),

  // Moderation-specific
  MODERATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  MAX_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(20),
  MAX_MESSAGES_PER_HOUR: z.coerce.number().int().positive().default(200),
  MODERATION_WEBHOOK_URL: z.url().optional(),

  // AI model configuration
  AI_ANALYSIS_MESSAGE_LIMIT: z.coerce.number().int().positive().default(200),
  GEMINI_FLASH_MODEL: z.string().default('gemini-2.0-flash'),
  GEMINI_PRO_MODEL: z.string().default('gemini-2.0-pro'),
  GEMINI_LITE_MODEL: z.string().default('gemini-2.0-flash-lite'),
  GEMINI_SEARCH_MODEL: z.string().default('gemini-2.0-flash'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_API_KEY: z.string().optional(),

  // AI search
  SASTRAM_EXA_KEY: z.string().optional(),
  SASTRAM_TAVILY_KEY: z.string().optional(),

  // Server
  HOSTNAME: z.string().default('localhost'),
});

/**
 * Validated environment variables
 * This object is guaranteed to have all required variables with correct types
 */
export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validate and return environment variables
 * Throws an error if validation fails
 */
export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((err) => {
      return `  - ${err.path.join('.')}: ${err.message}`;
    });

    throw new Error(
      `Environment validation failed:\n${errors.join(
        '\n'
      )}\n\nPlease check your .env file and ensure all required variables are set.`
    );
  }

  cachedEnv = result.data;

  // Warn if Neon pooling is misconfigured in production
  if (
    cachedEnv.NODE_ENV === 'production' &&
    !cachedEnv.DATABASE_URL.includes('pgbouncer=true')
  ) {
    console.warn(
      '[env] WARNING: DATABASE_URL does not contain pgbouncer=true.\n' +
        'Neon free tier has limited direct connections. Without pgbouncer, each serverless\n' +
        'function creates a direct connection which will exhaust your connection limit.\n' +
        'Append ?pgbouncer=true to your DATABASE_URL in the Neon console, or set\n' +
        'DATABASE_URL to the pooled connection string and DATABASE_URL_UNPOOLED for direct access.',
    );
  }

  return cachedEnv;
}

// Eagerly-validated, typed env object for convenient imports
export const env: Env = getEnv();

/**
 * Validate environment variables without throwing
 * Returns validation result
 */
export function validateEnv() {
  return envSchema.safeParse(process.env);
}
