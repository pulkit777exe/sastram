# Contributing

Thanks for your interest in contributing to Sastram.

## Getting Started

### Option A — Docker (recommended for local dev)

`docker compose up` starts PostgreSQL, Redis, and the Next.js app in one
command. Copy `.env.sample` to `.env` first and fill at least the required
values (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`NEXT_PUBLIC_APP_URL`, and the `RESEND_*` vars).

### Option B — Local without Docker

- Fork the repository
- Run `pnpm install`
- Copy `.env.sample` to `.env` and fill in the values
- Provide your own PostgreSQL (e.g. free-tier Neon: append `?pgbouncer=true`
  to `DATABASE_URL`) and Redis (e.g. free-tier Upstash — set
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`). Without Redis, rate
  limiting degrades to best-effort.
- Run `pnpm db:migrate`
- Run `pnpm dev` to start the development server
- Run `pnpm test` to verify everything works

## Development Workflow

1. Create a branch from `main`: `git checkout -b feature/your-feature`
2. Make your changes
3. Run `pnpm typecheck` and `pnpm lint` — both must pass
4. Add or update tests as needed: `pnpm test`
5. Commit using descriptive messages (prefix: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
6. Push and open a PR

## Code Standards

- TypeScript with strict mode — no `any` unless absolutely necessary
- Server actions use `createServerAction` for validation and error handling
- API routes use `withErrorHandling` for consistent error responses
- Environment variables go through `lib/config/env.ts` — add new ones to the schema
- All `process.env` access should be via the validated `env` object or `getEnv()`
- New job types: add types in `lib/queue/types.ts`, processor in `lib/queue/workers/`, register in `lib/queue/workers/index.ts`

## Project Structure

```
app/          — Next.js App Router pages and API routes
lib/          — Core utilities, services, infrastructure
modules/      — Domain modules (25 feature modules)
components/   — UI components
test/         — Mocha unit tests
```
