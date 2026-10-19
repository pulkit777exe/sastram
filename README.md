<p align="center">
  <samp>
    <b>Sastram</b> · discussion and research platform<br>
    <sub>personal project · open source · built with next.js, prisma, ai</sub>
  </samp>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="./CLAUDE.md"><img src="https://img.shields.io/badge/docs-CLAUDE.md-grey" alt="Architecture"></a>
</p>

---

A discussion platform with AI-powered search, threading, and moderation. Originally a personal project, now open source.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Neon serverless
- **ORM**: Prisma 7
- **Auth**: Better Auth (email OTP)
- **AI**: Google Gemini / OpenAI GPT
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: React hooks + `@tanstack/react-virtual` for long lists (no global store)
- **Infra**: Upstash Redis, QStash, Vercel Blob

## Features

- **Threaded discussions** — public, restricted, and private threads with visibility-based access control
- **AI-powered search** — semantic forum search with citations (Exa/Tavily + Gemini fallback)
- **AI thread analysis** — summaries, thread DNA, resolution scores, conflict detection
- **Moderation** — regex-based content filtering, AI inline moderation, moderator notifications, SLA metrics (pending 24h/72h buckets + average first-response time)
- **Background jobs** — QStash-powered workers for summaries, digests, email, and AI insights
- **Spend caps & quotas** — dollar-based daily AI spend limits and per-user daily quotas via Redis
- **Reactions, polls, bookmarks, follows** — full engagement toolkit
- **Newsletters** — scheduled digest emails

## Quick Start

### Option A: Local setup

```bash
bun install
cp .env.example .env      # fill in required values
bun db:migrate
bun run db:extensions   # one-time: pg_trgm ILIKE-search GIN indexes (idempotent, outside migration history)
bun db:seed               # demo threads + admin/system users (optional)
bun dev
```

### Option B: Docker

```bash
docker compose up
```

Starts PostgreSQL and the Next.js app. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full environment setup.

## Production Checks

```bash
bun typecheck
bun lint
bun build
NODE_ENV=production bun check:prod
```

`bun check:prod` validates required production environment variables, URL shape, and infrastructure pairs.

## Testing

```bash
bun run test          # Mocha unit + route tests
bun test:e2e          # Playwright e2e (smoke + collections + thread-edit; local only — not run in CI)
```

## Project Structure

```
app/          — Next.js App Router pages & API routes
modules/      — Domain modules (threads, messages, ai-search, moderation, etc.)
lib/          — Core services, infrastructure, utilities
  ai/         — Gemini/OpenAI/NoOp providers, prompts, guard
  config/     — Environment schema, permissions, routes
  infrastructure/ — Prisma, Redis (Upstash REST), logger
  middleware/ — Cron auth, moderation, AI preflight
  queue/      — QStash job types & registry
  schemas/    — Shared Zod schemas
  services/   — AI spend-cap, auth, rate-limit, quotas, email, etc.
  utils/      — Server actions, API helpers, SSE, validation
components/   — shadcn/ui primitives + feature components
hooks/        — React hooks (chat, thread, AI streaming, preferences)
prisma/       — Database schema (35 models)
test/         — Mocha suite + Playwright e2e (e2e is not run in CI)
```

See [CLAUDE.md](./CLAUDE.md) for architecture details and [docs/CANONICAL-REFERENCE.md](./docs/CANONICAL-REFERENCE.md) for the verified system reference.

## License

MIT &mdash; see [LICENSE](./LICENSE).<br>
Contributions welcome &mdash; see [CONTRIBUTING.md](./CONTRIBUTING.md).
