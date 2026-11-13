# Contributing

Thanks for your interest in contributing to Sastram.

## Good first issues

Look for issues labelled **`good first issue`** in the repository. Good candidates
are small docs corrections, focused tests, accessibility fixes, and obvious
copy/UX bugs. Avoid schema, auth, payments, or moderation-policy changes until
you have discussed them with a maintainer.

1. Comment on the issue to claim it and ask any clarifying questions.
2. Keep the PR to one concern; link the issue in the description.
3. Run the checks below and paste the real output in the PR.
4. If the task changes behavior, add or update a test.

See [ROADMAP.md](./ROADMAP.md) for the current focus. If you are unsure where to
start, open a discussion or ask on an issue — please do not send a cold PR that
changes architecture without agreement first.

## Getting Started

### Option A — Docker (recommended)

`docker compose up` starts PostgreSQL, applies migrations, and starts the Next.js app in one command. Copy `.env.example` to `.env` first and fill in at least the required values. Your user must be able to reach the Docker daemon (`docker info` succeeds); on Linux that usually means membership in the `docker` group plus a re-login. (A `redis` service exists under the `tools` profile for experimentation only — the app never connects to it; limits/quotas use Upstash or in-memory fallback.)

### Option B — Local without Docker

1. Fork the repository
2. Run `bun install`
3. Copy `.env.example` to `.env` and fill in the values
4. Provide PostgreSQL (e.g. free-tier Neon: append `?pgbouncer=true` to `DATABASE_URL`; set `DATABASE_URL_UNPOOLED` to the direct endpoint for migrations) and optionally Upstash Redis (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — without them, rate limits and quotas degrade to per-instance in-memory)
5. Run `bun db:migrate`
6. Apply the trigram search indexes once: `bun run db:extensions` (idempotent; Prisma cannot express GIN opclasses, so they live outside migration history and `prisma migrate deploy` never applies them)
7. Run `bun db:seed` for demo threads + admin/system users (optional)
8. Run `bun dev` to start the development server
9. Run `bun run test` to verify everything works (uses `.env.test` — no external services needed)

> `bun test` invokes Bun's built-in runner, not the Mocha suite — always use `bun run test`.

> Port 5432 blocked by the network (TLS payloads dropped)? Replace steps 5–6 with `bun run db:deploy:data-api --extensions`: it replays pending migrations (and the trgm SQL) over Neon's HTTPS Data API and writes Prisma-identical history rows.

### Required Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Auth signing secret (min 32 chars)
- `BETTER_AUTH_URL` — Auth base URL
- `NEXT_PUBLIC_APP_URL` — Public app URL
- `RESEND_API_KEY` + `RESEND_FROM` + template IDs (`RESEND_TEMPLATE_OTP`, `RESEND_TEMPLATE_INVITATION`, `RESEND_TEMPLATE_THREAD_SUMMARY`, `RESEND_TEMPLATE_PASSWORD_RESET`, `RESEND_TEMPLATE_WELCOME`) — Email delivery

### Optional but Recommended

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Rate limiting, quotas, caching (omit for in-memory local fallback)
- `QSTASH_TOKEN` + signing keys — Background jobs
- `GEMINI_API_KEY` or `OPENAI_API_KEY` — AI features
- `CRON_SECRET` — Scheduled jobs (min 32 chars)

## Development Workflow

1. Create a branch from `main`: `git checkout -b feature/your-feature`
2. Make your changes
3. Run `bun typecheck` and `bun lint` — both must pass
4. Add or update tests: `bun run test` (Playwright e2e via `bun run test:e2e` runs in CI's `e2e` job — it seeds a test user and manages its own dev server)
5. Commit with descriptive messages (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
6. Push and open a PR

## Code Standards

- TypeScript strict mode — avoid `any` unless absolutely necessary
- Server actions use `createServerAction` from `lib/utils/server-action.ts`
- API routes use `withErrorHandling` for consistent error responses
- Environment variables go through `lib/config/env.ts` — add new ones to the schema
- All `process.env` access should be via the validated `env` object or `getEnv()`

## Module Conventions

Each feature module in `modules/` follows a consistent pattern:

```
modules/<feature>/
  actions.ts      — Server actions (createServerAction)
  repository.ts   — Database access layer
  service.ts      — Business logic (optional)
  schemas.ts      — Zod validation schemas (most modules)
  types.ts        — TypeScript types (optional)
  index.ts        — Public exports (optional)
  ...             — Module-specific flat files
```

Modules are flat: no `actions/`, `repository/`, `ports/`, or `adapters/` subdirectories. Test seams are flat files (`store.ts`, `effects.ts`, `side-effects.ts`).

### Authorization Patterns

**All API routes and server actions must enforce thread access checks.**

- Thread access is the primary authorization primitive — see `lib/thread-access.ts`
- Visibility rule: creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN for private/restricted threads; public threads are readable by anyone
- Use `requireReadOrThrow(threadId, userId, role)` for reads
- Use `requireWriteOrThrow(threadId, userId, role)` for writes
- Admin-only routes use `requireAdmin()` / `requireModerator()`

### Server Action Pattern

```typescript
import { createServerAction } from '@/lib/utils/server-action';
import { requireSession } from '@/modules/auth/session';
import { requireWriteOrThrow } from '@/lib/thread-access';

export const myAction = createServerAction(
  { schema: mySchema, actionName: 'myAction' },
  async (args) => {
    const session = await requireSession();
    await requireWriteOrThrow(args.threadId, session.user.id, session.user.role);
    // ... business logic
    return { data: result, error: null, ok: true, errorCode: null };
  }
);
```

### Background Jobs

New job types: add types in `lib/queue/types.ts`, implement the handler under `lib/queue/workers/` (`ai-jobs.ts` for AI jobs, `ai-inline.worker.ts`, `email.worker.ts`; shared helpers in `_shared.ts`), then register it in the `jobHandlers` map in `lib/queue/registry.ts` (`runJobInline` in `lib/services/queue.ts` executes handlers inline when QStash is unconfigured or `QSTASH_DEV=true`). Jobs retry 1x via QStash (3x for `email`/`CRITICAL_JOBS`); the free-tier daily publish cap (450) drops non-critical jobs but never `email`; non-retryable `AppError` returns 200 to prevent retry amplification.

## Project Structure

```
app/          — Next.js App Router pages & API routes
modules/      — Domain modules
lib/          — Core utilities, services, infrastructure
components/   — UI components
hooks/        — React hooks (chat, thread, AI streaming, preferences)
prisma/       — Database schema and migrations
test/         — Mocha suite + Playwright e2e (e2e runs in CI's e2e job)
```

See [shared/ARCHITECTURE.md](./shared/ARCHITECTURE.md) for the canonical architecture reference and [CLAUDE.md](./CLAUDE.md) for the condensed operational guide.
