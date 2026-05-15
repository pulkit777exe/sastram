import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_TLS: z.coerce.boolean().default(false),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  QUEUE_WORKERS_ENABLED: z.coerce.boolean().default(true),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Sastram <noreply@sastram.com>'),

  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  AI_ANALYSIS_MESSAGE_LIMIT: z.coerce.number().int().positive().default(50),

  SASTRAM_EXA_KEY: z.string().optional(),
  SASTRAM_TAVILY_KEY: z.string().optional(),
  SASTRAM_GEMINI_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters').optional(),

  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  CONTENT_MODERATION_ENABLED: z.coerce.boolean().default(false),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  MODERATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

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
