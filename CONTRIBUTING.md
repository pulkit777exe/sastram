# Contributing

Thanks for your interest in contributing to Sastram.

## Getting Started

- Fork the repository
- Run `pnpm install`
- Copy `.env.sample` to `.env` and fill in the values
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
modules/      — Domain modules (26 feature modules)
components/   — UI components
test/         — Mocha unit tests
```
