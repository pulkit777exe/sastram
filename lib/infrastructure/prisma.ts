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
  const pooledUrl = process.env.DATABASE_URL;
  if (!pooledUrl) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  const unpooledUrl = process.env.DATABASE_URL_UNPOOLED;

  if (process.env.NODE_ENV === 'production' && !pooledUrl.includes('pgbouncer=true')) {
    logger.warn(
      '[prisma] DATABASE_URL does not contain pgbouncer=true — connections bypass Neon pool. ' +
      'Use a pooled connection string or set DATABASE_URL_UNPOOLED for direct connections.',
    );
  }

  return pooledUrl.includes('pgbouncer=true') && unpooledUrl ? unpooledUrl : pooledUrl;
}

function createPrismaClient() {
  const connectionString = resolveConnectionString();
  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn', 'query'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
