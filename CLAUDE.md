# Sastram — Discussion and Research Platform

Personal project, open sourced. Next.js 16 App Router, TypeScript, Prisma 7, PostgreSQL (Neon), Better Auth, and AI search.

## Canonical references

- [shared/ARCHITECTURE.md](shared/ARCHITECTURE.md) — the only current architecture reference (system design, routes, data model, jobs, env vars).
- [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) — domain vocabulary.
- [docs/adr/](docs/adr/) — decision records and historical architecture-review logs.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — release order, probes, crons, backups, rollback.

Do not create a second architecture doc or hard-code inventory counts; inspect `prisma/schema.prisma`, `modules/`, `app/api/`, and `test/` instead.

## Commands

```bash
# Development
bun dev              # Next.js + QStash dev server (concurrently)
bun dev:next         # Next.js only
bun dev:qstash       # QStash only

# Build & deploy
bun run build        # Prisma generate + Next build (bare `bun build` is Bun's bundler)
bun start            # Production server (next start)
bun check:prod       # Production readiness checks

# Verification
bun typecheck
bun lint
bun run test         # Mocha suite
bun test:e2e         # Playwright e2e (CI e2e job)
bun run audit:gate   # dependency audit policy gate
bun format           # Prettier

# Database
bun db:generate
bun db:push
bun db:migrate
bun db:deploy        # prod migrations (forward-only)
bun db:deploy:data-api  # migrations over Neon HTTPS Data API (5432-blocked networks)
bun run db:extensions   # idempotent pg_trgm GIN indexes
bun db:studio
```

## Layout

- `app/` — App Router pages and API routes.
- `modules/` — domain modules, flat files only (no `actions/`, `repository/`, `ports/`, or `adapters/` subdirectories).
- `lib/` — infrastructure, services, AI, queue, shared utilities.
- `components/` — UI components.
- `hooks/` — React hooks.
- `prisma/` — schema and forward-only migrations.
- `test/` — Mocha unit/route tests and Playwright e2e.

## Conventions

- Server actions use `createServerAction` / `withValidation` from `lib/utils/server-action.ts` and return `{ data, error, ok, errorCode }`. They never throw.
- API routes use `withErrorHandling` from `lib/utils/api-response.ts`; errors are `AppError` with a status code.
- Environment variables go through the Zod schema in `lib/config/env.ts`. Do not read `process.env` directly in app code (the documented exception is `CSP_REPORT_ONLY` in `proxy.ts`).
- **Thread access is the primary authorization primitive.** Use `requireReadOrThrow` / `requireWriteOrThrow` / `requireManageOrThrow` from `lib/thread-access.ts` before touching thread data. There is no membership table: access derives from `visibility`, `createdBy`, accepted `ThreadInvitation`, and active bans.
- Real-time is SSE only (AI reply streaming); other updates poll. There is no WebSocket layer.
- Background jobs go through QStash (`app/api/jobs`), with handlers registered in `lib/queue/registry.ts`. Without QStash (or with `QSTASH_DEV=true`) they run inline.
- Vercel cron schedules live in `vercel.json`; every cron route uses `verifyCronAuth()`.
- UI uses the SAI tokens in `app/globals.css`: cards are `border border-line rounded-card shadow-card`; inputs/buttons use `rounded-control`; chips use `rounded-chip`. Do not use `rounded-xl`/`rounded-2xl` on card-level containers.
- AI calls go through `lib/ai/guard.ts` + `lib/middleware/ai-guard-route.ts` (session → quota → spend cap → cost gate → thread access). Do not call providers directly from routes.

## Testing

- Mocha tests live in `test/`; Playwright specs in `test/e2e/` (`smoke`, `collections`, `thread-edit`, `ux-fixes`, plus `global-setup`).
- Use Sinon stubs for Prisma/Redis/AI or the injected fakes in `test/support/`; reset rate limiters between tests.
- CI has five jobs: `secrets` (gitleaks), `audit` (`audit:gate`), `check` (typecheck, lint, build, Mocha on PostgreSQL 16), `docker` (image build), and `e2e` (Playwright on PostgreSQL 16). `format:check` is not run in CI.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
