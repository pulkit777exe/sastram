# Contributing

Thanks for your interest in contributing to Sastram.

## Getting Started

### Option A — Docker (recommended)

`docker compose up` starts PostgreSQL, Redis, and the Next.js app in one command. Copy `.env.example` to `.env` first and fill in at least the required values.

### Option B — Local without Docker

1. Fork the repository
2. Run `bun install`
3. Copy `.env.example` to `.env` and fill in the values
4. Provide PostgreSQL (e.g. free-tier Neon: append `?pgbouncer=true` to `DATABASE_URL`) and optionally Redis (free-tier Upstash)
5. Run `bun db:migrate`
6. Run `bun dev` to start the development server
7. Run `bun test` to verify everything works

### Required Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Auth signing secret (min 32 chars)
- `BETTER_AUTH_URL` — Auth base URL
- `NEXT_PUBLIC_APP_URL` — Public app URL
- `RESEND_API_KEY` + `RESEND_FROM` — Email delivery

### Optional but Recommended

- `REDIS_URL` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Rate limiting, quotas, caching
- `QSTASH_TOKEN` + signing keys — Background jobs
- `GEMINI_API_KEY` or `OPENAI_API_KEY` — AI features
- `CRON_SECRET` — Scheduled jobs (min 32 chars)

## Development Workflow

1. Create a branch from `main`: `git checkout -b feature/your-feature`
2. Make your changes
3. Run `bun typecheck` and `bun lint` — both must pass
4. Add or update tests: `bun test`
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
  actions/        — Server actions (createServerAction)
  repository/     — Database access layer
  schemas.ts      — Zod validation schemas
  types.ts        — TypeScript types
  service.ts      — Business logic
  index.ts        — Public API barrel export
```

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
import { requireSession } from '@/lib/services/auth';
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

New job types: add types in `lib/queue/types.ts`, processor in `lib/queue/workers/`, register in `lib/queue/workers/index.ts`. Jobs retry 1x via QStash (3x for `email`/`CRITICAL_JOBS`); non-retryable `AppError` returns 200 to prevent retry amplification.

## Project Structure

```
app/          — Next.js App Router pages & API routes (50 endpoints)
modules/      — 24 domain modules
lib/          — Core utilities, services, infrastructure
components/   — UI components
hooks/        — React hooks (chat, thread, AI streaming, preferences)
prisma/       — Database schema (35 models)
test/         — Mocha unit tests (61 files) + Playwright e2e
```

See [CLAUDE.md](./CLAUDE.md) for full architecture details.
