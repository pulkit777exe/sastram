import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import ws from 'ws';
import { logger } from '@/lib/infrastructure/logger';

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const PGBOUNCER_PARAM = 'pgbouncer=true';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function hasPgbouncerParam(url: string): boolean {
  return url.includes(PGBOUNCER_PARAM);
}

function appendPgbouncerParam(url: string): string {
  let separator = '?';
  if (url.includes('?')) separator = '&';
  return `${url}${separator}${PGBOUNCER_PARAM}`;
}

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  const needsPgbouncer = isProduction() && !hasPgbouncerParam(url);
  if (needsPgbouncer) {
    // Without pgbouncer=true each serverless invocation opens its own Neon connection
    // and we hit the connection limit under load.
    logger.info('[prisma] Auto-appended pgbouncer=true to DATABASE_URL for Neon serverless pooling.');
    return appendPgbouncerParam(url);
  }

  return url;
}

function isNeonConnectionString(connectionString: string): boolean {
  const isNeonHost = connectionString.includes('neon.tech');
  const isPoolerHost = connectionString.includes('-pooler.');
  return isNeonHost || isPoolerHost;
}

function createAdapter(connectionString: string) {
  const useNeonAdapter = isNeonConnectionString(connectionString);
  if (useNeonAdapter) {
    return new PrismaNeon({ connectionString });
  }
  return new PrismaPg({ connectionString });
}

function getPrismaLogLevels(): ('error' | 'warn' | 'query')[] {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    return ['error', 'warn', 'query'];
  }
  return ['error'];
}

function createPrismaClient() {
  let connectionString: string;
  try {
    connectionString = resolveConnectionString();
  } catch (err) {
    logger.error('[prisma] Failed to resolve DATABASE_URL', err);
    // Fallback to dummy URL that will fail gracefully at query time, not at boot
    connectionString = 'postgresql://dummy:dummy@localhost:5432/dummy?schema=public';
  }
  const adapter = createAdapter(connectionString);
  const client = new PrismaClient({
    adapter,
    log: getPrismaLogLevels(),
  });

  // Test connection in background, log warning if unreachable (don't crash)
  if (process.env.NODE_ENV !== 'production') {
    // Use $connect() which will trigger DNS lookup; catch ENOTFOUND
    client.$connect().catch((err) => {
      logger.warn('[prisma] Database connection failed on startup - app will run in degraded mode', {
        code: (err as NodeJS.ErrnoException)?.code,
        hostname: (err as { hostname?: string })?.hostname,
        message: (err as Error)?.message?.slice(0, 100),
      });
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Reuse across HMR reloads in dev, otherwise every save leaks a client.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
