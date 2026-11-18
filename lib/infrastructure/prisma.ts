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

export type PrismaAdapterKind = 'neon' | 'pg';

export interface ResolvedPrismaConnection {
  connectionString: string;
  adapter: PrismaAdapterKind;
  appendedPgbouncer: boolean;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function hasPgbouncerParam(url: string): boolean {
  return url.includes(PGBOUNCER_PARAM);
}

export function appendPgbouncerParam(url: string): string {
  if (!url.includes('?')) {
    return `${url}?${PGBOUNCER_PARAM}`;
  }
  // Avoid an empty query pair when the URL already ends in `?` or `&`.
  if (url.endsWith('?') || url.endsWith('&')) {
    return `${url}${PGBOUNCER_PARAM}`;
  }
  return `${url}&${PGBOUNCER_PARAM}`;
}

export function isNeonConnectionString(connectionString: string): boolean {
  const isNeonHost = connectionString.includes('neon.tech');
  const isPoolerHost = connectionString.includes('-pooler.');
  return isNeonHost || isPoolerHost;
}

/**
 * Decide both the effective connection string and the driver adapter before a
 * client is created. `pgbouncer=true` is a Neon/PgBouncer setting: appending it
 * to a local or self-hosted Postgres URL in production is wrong, so only Neon
 * and pooler hosts get it, and only when the flag is not already present.
 */
export function resolvePrismaConnection(
  connectionString: string,
  production: boolean = isProduction()
): ResolvedPrismaConnection {
  const useNeonAdapter = isNeonConnectionString(connectionString);
  const appendedPgbouncer = production && useNeonAdapter && !hasPgbouncerParam(connectionString);

  return {
    connectionString: appendedPgbouncer ? appendPgbouncerParam(connectionString) : connectionString,
    adapter: useNeonAdapter ? 'neon' : 'pg',
    appendedPgbouncer,
  };
}

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  return url;
}

function createAdapter(resolved: ResolvedPrismaConnection) {
  if (resolved.adapter === 'neon') {
    logger.info('[prisma] Using PrismaNeon adapter');
    return new PrismaNeon({ connectionString: resolved.connectionString });
  }
  logger.info('[prisma] Using PrismaPg adapter');
  return new PrismaPg({ connectionString: resolved.connectionString });
}

function getPrismaLogLevels(): ('error' | 'warn' | 'query')[] {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    return ['error', 'warn', 'query'];
  }
  return ['error'];
}

function createPrismaClient() {
  let databaseUrl: string;
  try {
    databaseUrl = resolveDatabaseUrl();
  } catch (err) {
    logger.error('[prisma] Failed to resolve DATABASE_URL', err);
    // Fallback to dummy URL that will fail gracefully at query time, not at boot
    databaseUrl = 'postgresql://dummy:dummy@localhost:5432/dummy?schema=public';
  }

  const resolved = resolvePrismaConnection(databaseUrl);
  if (resolved.appendedPgbouncer) {
    // Without pgbouncer=true each serverless invocation opens its own Neon connection
    // and we hit the connection limit under load.
    logger.info(
      '[prisma] Auto-appended pgbouncer=true to DATABASE_URL for Neon serverless pooling.'
    );
  }

  const adapter = createAdapter(resolved);
  const client = new PrismaClient({
    adapter,
    log: getPrismaLogLevels(),
  });

  // Test connection in background, log warning if unreachable (don't crash)
  if (process.env.NODE_ENV !== 'production') {
    // Use $connect() which will trigger DNS lookup; catch ENOTFOUND
    client.$connect().catch((err) => {
      logger.warn(
        '[prisma] Database connection failed on startup - app will run in degraded mode',
        {
          code: (err as NodeJS.ErrnoException)?.code,
          hostname: (err as { hostname?: string })?.hostname,
          message: (err as Error)?.message?.slice(0, 100),
        }
      );
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Reuse across HMR reloads in dev, otherwise every save leaks a client.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
