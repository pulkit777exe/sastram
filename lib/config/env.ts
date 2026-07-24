import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.url('REDIS_URL must be a valid URL').optional(),
  UPSTASH_REDIS_REST_URL: z.url('UPSTASH_REDIS_REST_URL must be a valid URL').optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADMIN_ID: z.string().optional(),
  GOOGLE_ADMIN_SECRET: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_FROM: z.string().default('Sastram <noreply@sastram.wtfpulkit.dev>'),
  RESEND_TEMPLATE_OTP: z.string().min(1, 'RESEND_TEMPLATE_OTP is required'),
  RESEND_TEMPLATE_INVITATION: z.string().min(1, 'RESEND_TEMPLATE_INVITATION is required'),
  RESEND_TEMPLATE_THREAD_SUMMARY: z.string().min(1, 'RESEND_TEMPLATE_THREAD_SUMMARY is required'),
  RESEND_TEMPLATE_PASSWORD_RESET: z.string().min(1, 'RESEND_TEMPLATE_PASSWORD_RESET is required'),
  RESEND_TEMPLATE_WELCOME: z.string().min(1, 'RESEND_TEMPLATE_WELCOME is required'),
  GEMINI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  WEBSOCKET_URL: z.string().url('WEBSOCKET_URL must be a valid URL').optional(),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters').optional(),
  QSTASH_URL: z.string().url('QSTASH_URL must be a valid URL').optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  RATE_LIMIT_ENABLED: z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform(v => v === true || v === 'true' || v === '1').default(true),
  CONTENT_MODERATION_ENABLED: z.coerce.boolean().default(false),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_FILE_UPLOAD_MB: z.coerce.number().int().positive().default(10),
  MODERATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  MAX_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(20),
  MAX_MESSAGES_PER_HOUR: z.coerce.number().int().positive().default(200),
  MODERATION_WEBHOOK_URL: z.url().optional(),
  AI_ANALYSIS_MESSAGE_LIMIT: z.coerce.number().int().positive().default(200),
  GEMINI_FLASH_MODEL: z.string().default('gemini-3-flash-preview'),
  GEMINI_PRO_MODEL: z.string().default('gemini-2.5-pro'),
  GEMINI_LITE_MODEL: z.string().default('gemini-3.1-flash-lite'),
  GEMINI_SEARCH_MODEL: z.string().default('gemini-3.1-flash-lite'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_API_KEY: z.string().optional(),
  SASTRAM_EXA_KEY: z.string().optional(),
  SASTRAM_TAVILY_KEY: z.string().optional(),
  SASTRAM_GEMINI_KEY: z.string().optional(),
  HOSTNAME: z.string().default('localhost'),
  PORT: z.coerce.number().int().positive().default(3000),
});

const fullyClientSafeSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  NEXT_PUBLIC_OPENAI_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof fullyClientSafeSchema>;
export type FullyClientSafeEnv = ClientEnv;

export const clientEnv: FullyClientSafeEnv = (() => {
  const result = fullyClientSafeSchema.safeParse(process.env);
  if (!result.success) {
    console.warn('Client env validation error:', result.error.issues.map(err => err.message));
    return result.data || ({} as FullyClientSafeEnv);
  }
  return result.data;
})();

let serverEnvCache: ServerEnv | null = null;
export function getServerEnv(): ServerEnv {
  if (serverEnvCache) {
    return serverEnvCache;
  }

  const result = serverEnvSchema.safeParse(process.env);

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

  serverEnvCache = result.data;
  return serverEnvCache;
}

export const serverEnv: ServerEnv = getServerEnv();

export function validateEnv() {
  return serverEnvSchema.safeParse(process.env);
}

export const env = getServerEnv(); 

export type MergedEnv = ServerEnv & Pick<ClientEnv, 'NODE_ENV' | 'NEXT_PUBLIC_APP_URL'>;

let mergedEnvCache: MergedEnv | null = null;
export function getEnv(): MergedEnv {
  if (mergedEnvCache) {
    return mergedEnvCache;
  }

  const server = getServerEnv();
  const clientResult = fullyClientSafeSchema.safeParse(process.env);

  if (!clientResult.success) {
    const errors = clientResult.error.issues.map((err) => `  - ${err.path.join('.')}: ${err.message}`);
    throw new Error(
      `Environment validation failed (client subset):\n${errors.join('\n')}\n\nPlease check your .env file.`
    );
  }

  mergedEnvCache = {
    ...server,
    NODE_ENV: clientResult.data.NODE_ENV,
    NEXT_PUBLIC_APP_URL: clientResult.data.NEXT_PUBLIC_APP_URL,
  };
  return mergedEnvCache;
}