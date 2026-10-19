/**
 * Apply `prisma/extensions/*.sql` to the direct database connection.
 *
 * Why: Prisma cannot express GIN opclasses in schema.prisma, so the pg_trgm
 * search indexes live as plain SQL outside migration history — `prisma
 * migrate deploy` never applies them and ILIKE search silently seq-scans
 * without them.
 *
 * Every statement in every extension file must be idempotent
 * (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS): the script re-runs safely
 * and is safe to wire into CI/prod deploy after `prisma migrate deploy`.
 *
 * `apply-via-sql-editor.sql` is deliberately NOT auto-applied: it is a
 * hand-maintained payload for the Neon SQL Editor (HTTPS-only environments)
 * and duplicates migration DDL, not extension DDL.
 *
 * Connection: DATABASE_URL_UNPOOLED first (direct endpoint — pooled
 * connections cannot run DDL reliably on Neon), falling back to
 * DATABASE_URL. Migrations must already be applied (the files reference
 * tables owned by migrations).
 *
 * Run:
 *   bun scripts/apply-extensions.ts
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const EXTENSIONS_DIR = join(process.cwd(), 'prisma', 'extensions');

/**
 * Strip `--` line comments, then split on `;`. Extension files are plain DDL
 * (no semicolons inside string literals or function bodies), so this is a
 * correct reader for them.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** One-line preview so the log says exactly what ran. */
function statementLabel(statement: string): string {
  return statement.replace(/\s+/g, ' ').slice(0, 100);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('[extensions] DATABASE_URL_UNPOOLED / DATABASE_URL is not set');
    process.exit(1);
  }
  const target = process.env.DATABASE_URL_UNPOOLED ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL';

  const MANUAL_ONLY_FILES = new Set(['apply-via-sql-editor.sql']);
  const files = readdirSync(EXTENSIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !MANUAL_ONLY_FILES.has(file))
    .sort();
  if (files.length === 0) {
    console.log(`[extensions] no .sql files in ${EXTENSIONS_DIR}`);
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  console.log(`[extensions] applying ${files.length} file(s) via ${target}`);

  let applied = 0;
  try {
    for (const file of files) {
      const statements = splitStatements(readFileSync(join(EXTENSIONS_DIR, file), 'utf8'));
      console.log(`[extensions] ${file}: ${statements.length} statement(s)`);
      for (const statement of statements) {
        await client.query(statement);
        applied += 1;
        console.log(`  ✓ ${statementLabel(statement)}`);
      }
    }
    console.log(`[extensions] done: ${applied} statement(s) applied (idempotent)`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('[extensions] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
