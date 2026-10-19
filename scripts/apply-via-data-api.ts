/**
 * Apply pending Prisma migrations (and, optionally, the extension SQL) over
 * Neon's HTTPS Data API.
 *
 * Why: some networks accept TCP on port 5432 but drop the TLS payload, so
 * `prisma migrate deploy` (`pg`, too) hangs or fails with P1001. Neon serves
 * SQL over HTTPS at https://<endpoint>/sql — the same channel
 * `@neondatabase/serverless` uses at runtime — so this script replays
 * migrations there.
 *
 * Semantics mirror `prisma migrate deploy`:
 * - every recorded migration is verified against the local file's sha256
 *   checksum — the same bookkeeping Prisma keeps in `_prisma_migrations`;
 * - history must be a prefix of `prisma/migrations/*`; diverging, rolled-back
 *   or unfinished rows abort before anything runs;
 * - a failing migration is recorded (finished_at NULL + logs) so the next run
 *   refuses until it is resolved, exactly like Prisma;
 * - a non-empty schema with no history aborts — baseline it first
 *   (`prisma migrate resolve --applied <name>`) instead of replaying.
 *
 * Usage:
 *   bun run db:deploy:data-api                 # apply pending migrations
 *   bun run db:deploy:data-api --dry-run       # validate + list, change nothing
 *   bun run db:deploy:data-api --extensions    # migrations, then extension SQL
 *   bun run db:extensions:data-api             # extension SQL only
 *
 * Connection: DATABASE_URL (pooled or direct — the Data API routes each query
 * over HTTPS with no pgbouncer session state, so pooling is irrelevant here).
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { splitStatements } from '@/lib/utils/sql-statements';

const MIGRATIONS_DIR = 'prisma/migrations';
const EXTENSIONS_DIR = 'prisma/extensions';
const HISTORY_TABLE = '_prisma_migrations';
/** Manual payloads (duplicate migration DDL) — never auto-applied. */
const MANUAL_ONLY_FILES = new Set(['apply-via-sql-editor.sql']);

interface MigrationFile {
  name: string;
  file: string;
}

interface HistoryRow {
  migration_name: string;
  checksum: string;
  finished_at: string | null;
  rolled_back_at: string | null;
}

function fail(message: string): never {
  console.error(`[data-api] ${message}`);
  process.exit(1);
}

function migrationFiles(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d/.test(name))
    .sort()
    .map((name) => ({ name, file: join(MIGRATIONS_DIR, name, 'migration.sql') }));
}

function fileChecksum(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function statementLabel(statement: string): string {
  const code = statement
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (code || statement.replace(/\s+/g, ' ')).slice(0, 96);
}

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log(
    'Usage: apply-via-data-api [--dry-run] [--extensions | --extensions-only]\n' +
      '  --dry-run          validate history + list pending work, change nothing\n' +
      '  --extensions       apply extension SQL after migrations\n' +
      '  --extensions-only  apply extension SQL only'
  );
  process.exit(0);
}
const dryRun = args.has('--dry-run');
const withExtensions = args.has('--extensions');
const extensionsOnly = args.has('--extensions-only');

const url = process.env.DATABASE_URL;
if (!url) {
  fail('DATABASE_URL is not set');
}
const sql = neon(url);

async function readHistory(): Promise<HistoryRow[]> {
  const [{ n }] = (await sql.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [HISTORY_TABLE]
  )) as [{ n: number }];
  if (n === 0) {
    return [];
  }
  return (await sql.query(
    `SELECT migration_name, checksum, finished_at, rolled_back_at FROM "${HISTORY_TABLE}" ORDER BY started_at`
  )) as HistoryRow[];
}

async function runMigrations(): Promise<void> {
  const files = migrationFiles();
  const rows = await readHistory();
  const byName = new Map(files.map((f) => [f.name, f]));

  rows.forEach((row, idx) => {
    const local = byName.get(row.migration_name);
    if (!local) {
      fail(`history has "${row.migration_name}", which is not in ${MIGRATIONS_DIR}/ — histories diverge`);
    }
    if (row.rolled_back_at) {
      fail(`"${row.migration_name}" was rolled back — resolve it before running this script`);
    }
    if (!row.finished_at) {
      fail(`"${row.migration_name}" never finished — resolve it (prisma migrate resolve) before re-running`);
    }
    if (row.checksum !== fileChecksum(local.file)) {
      fail(`"${row.migration_name}" checksum mismatch — the file was modified after it was applied`);
    }
    if (!files[idx] || files[idx].name !== row.migration_name) {
      fail(`history order diverges at "${row.migration_name}" (expected "${files[idx]?.name ?? '—'}")`);
    }
  });

  const pending = files.slice(rows.length);

  if (rows.length === 0) {
    const [{ n }] = (await sql.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name <> $1`,
      [HISTORY_TABLE]
    )) as [{ n: number }];
    if (n > 0) {
      fail(
        `found ${n} table(s) but no migration history — refusing to replay. ` +
          'Baseline the database first (prisma migrate resolve --applied <name>) or apply prisma/extensions/apply-via-sql-editor.sql.'
      );
    }
  }

  if (pending.length === 0) {
    console.log(`[data-api] history verified: ${rows.length} migration(s) applied, nothing pending`);
    return;
  }

  console.log(
    `[data-api] ${rows.length} applied, ${pending.length} pending${dryRun ? ' (dry run)' : ''}`
  );
  if (dryRun) {
    for (const { name, file } of pending) {
      console.log(`  pending ${name} (${splitStatements(readFileSync(file, 'utf8')).length} statements)`);
    }
    return;
  }

  await sql.query(
    `CREATE TABLE IF NOT EXISTS "${HISTORY_TABLE}" ("id" varchar(36) NOT NULL, "checksum" varchar(64) NOT NULL, "finished_at" timestamptz, "migration_name" varchar(255) NOT NULL, "logs" text, "rolled_back_at" timestamptz, "started_at" timestamptz NOT NULL DEFAULT now(), "applied_steps_count" integer NOT NULL DEFAULT 0, CONSTRAINT "${HISTORY_TABLE}_pkey" PRIMARY KEY ("id"))`
  );

  for (const { name, file } of pending) {
    const statements = splitStatements(readFileSync(file, 'utf8'));
    const rowId = randomUUID();
    await sql.query(
      `INSERT INTO "${HISTORY_TABLE}" ("id","checksum","migration_name","started_at","applied_steps_count") VALUES ($1,$2,$3, now(), 0)`,
      [rowId, fileChecksum(file), name]
    );
    let applied = 0;
    for (const statement of statements) {
      try {
        await sql.query(statement);
        applied += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await sql
          .query(`UPDATE "${HISTORY_TABLE}" SET "logs" = $2 WHERE "id" = $1`, [
            rowId,
            `statement ${applied + 1}/${statements.length}: ${message}`.slice(0, 2000),
          ])
          .catch(() => undefined);
        fail(
          `"${name}" failed on statement ${applied + 1}/${statements.length}: ${message}\n` +
            `  SQL: ${statementLabel(statement)}`
        );
      }
    }
    await sql.query(
      `UPDATE "${HISTORY_TABLE}" SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1`,
      [rowId]
    );
    console.log(`  ok  ${name} (${statements.length} statements)`);
  }
}

async function runExtensions(): Promise<void> {
  const files = readdirSync(EXTENSIONS_DIR)
    .filter((name) => name.endsWith('.sql') && !MANUAL_ONLY_FILES.has(name))
    .sort();
  if (files.length === 0) {
    console.log('[data-api] no extension files to apply');
    return;
  }
  console.log(`[data-api] extensions: ${files.length} file(s)${dryRun ? ' (dry run)' : ''}`);
  for (const name of files) {
    const statements = splitStatements(readFileSync(join(EXTENSIONS_DIR, name), 'utf8'));
    for (const statement of statements) {
      if (dryRun) {
        console.log(`  would run  ${statementLabel(statement)}`);
        continue;
      }
      try {
        await sql.query(statement);
        console.log(`  ok  ${statementLabel(statement)}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        fail(`"${name}" failed: ${message}\n  SQL: ${statementLabel(statement)}`);
      }
    }
  }
}

async function main(): Promise<void> {
  if (extensionsOnly) {
    await runExtensions();
  } else {
    await runMigrations();
    if (withExtensions) {
      await runExtensions();
    }
  }
  console.log('[data-api] done');
}

main().catch((error: unknown) => {
  console.error('[data-api] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
