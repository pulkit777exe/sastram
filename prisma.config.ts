import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config();

// This URL is used by Prisma CLI commands (migrate dev/deploy, db push, studio).
// Neon exposes two endpoints for the same database:
//   - pooled  (host contains "-pooler"): for app query traffic via PgBouncer
//   - direct  (no "-pooler" suffix):    required for schema migrations
// Running migrations over the pooled connection fails in ways that never name
// pooling ("prepared statement s0 already exists", an SET search_path that does
// not persist, or SQLSTATE 25006 read-only-transaction writes). Prefer
// DATABASE_URL_UNPOOLED (Neon's `neon env pull` convention) and otherwise
// derive the direct URL from the pooled DATABASE_URL.
function stripPooling(url: string): string {
  let result = url.replace(/[?&]pgbouncer=true/g, '');
  result = result.replace(/([?&])[?&]+/g, '$1').replace(/[?&]$/, '');
  return result.replace('-pooler', '');
}

function resolveDirectUrl(): string {
  const unpooled = process.env.DATABASE_URL_UNPOOLED;
  if (unpooled && unpooled.trim()) {
    return unpooled.trim();
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  return stripPooling(url);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolveDirectUrl(),
  },
});