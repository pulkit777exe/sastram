import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';
import { logger } from '@/lib/infrastructure/logger';

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  // Without pgbouncer=true each serverless invocation opens its own Neon connection
  // and we hit the connection limit under load.
  if (process.env.NODE_ENV === 'production' && !url.includes('pgbouncer=true')) {
    logger.info('[prisma] Auto-appended pgbouncer=true to DATABASE_URL for Neon serverless pooling.');
    return `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true`;
  }

  return url;
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: resolveConnectionString() }),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn', 'query'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Reuse across HMR reloads in dev, otherwise every save leaks a client.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
