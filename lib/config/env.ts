import { z } from "zod";

/**
 * Environment variable validation schema
 * This ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Server configuration
  PORT: z.string().default("3000").transform(Number),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // Redis (rate limiting, queues, caching)
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional(),

  // Better Auth
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL"),

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
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL"),
  NEXT_PUBLIC_OPENAI_API_KEY: z.string().optional(),
  
  // Email
  RESEND_API_KEY: z.string().optional(),
  
  // AI Providers
  GEMINI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),

  // AWS S3 (optional, for alternative file storage)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Realtime / WebSocket
  WEBSOCKET_URL: z.string().url("WEBSOCKET_URL must be a valid URL").optional(),

  // Security / sessions
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

  // Feature flags
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  CONTENT_MODERATION_ENABLED: z.coerce.boolean().default(false),

  // Logging
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // Limits
  MAX_FILE_UPLOAD_MB: z.coerce
    .number()
    .int()
    .positive()
    .default(10),

  // Moderation-specific
  MODERATION_CONFIDENCE_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.7),
  MAX_MESSAGES_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  MAX_MESSAGES_PER_HOUR: z.coerce
    .number()
    .int()
    .positive()
    .default(200),
  MODERATION_WEBHOOK_URL: z.string().url().optional(),
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
      return `  - ${err.path.join(".")}: ${err.message}`;
    });

    throw new Error(
      `Environment validation failed:\n${errors.join(
        "\n"
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

