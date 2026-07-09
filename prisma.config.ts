import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config();

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL!;

  // In production (Vercel), Neon serverless requires pgbouncer=true for connection pooling.
  // Auto-append if missing to prevent connection limit exhaustion.
  if (
    process.env.NODE_ENV === 'production' &&
    !url.includes('pgbouncer=true')
  ) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}pgbouncer=true`;
  }

  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
