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
- **State**: Zustand, TanStack Query
- **Infra**: Upstash Redis, QStash, Vercel Blob

## Features

- **Threaded discussions** — public, restricted, and private threads with visibility-based access control
- **AI-powered search** — semantic forum search with citations (Exa/Tavily + Gemini fallback)
- **AI thread analysis** — summaries, thread DNA, resolution scores, conflict detection
- **Moderation** — regex-based content filtering, AI inline moderation, moderator notifications, SLA-based escalation
- **Background jobs** — QStash-powered workers for summaries, digests, email, and AI insights
- **Spend caps & quotas** — dollar-based daily AI spend limits and per-user daily quotas via Redis
- **Reactions, polls, bookmarks, follows** — full engagement toolkit
- **Newsletters** — scheduled digest emails

## Quick Start

### Option A: Local setup

```bash
pnpm install
cp .env.sample .env      # fill in required values
pnpm db:migrate
pnpm dev
```

### Option B: Docker

```bash
docker compose up
```

Starts PostgreSQL, Redis, and the Next.js app. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full environment setup.

## Production Checks

```bash
pnpm typecheck
pnpm lint
pnpm build
NODE_ENV=production pnpm check:prod
```

`pnpm check:prod` validates required production environment variables, URL shape, and infrastructure pairs.

## Testing

```bash
pnpm test            # 297 passing (Mocha)
pnpm test:e2e       # Playwright smoke tests
```

## Project Structure

```
app/          — Next.js App Router pages & API routes
modules/      — 23 domain modules (threads, messages, ai-search, moderation, etc.)
lib/          — Core services, infrastructure, utilities
  actions/    — Shared action result types
  config/     — Environment schema, permissions, routes
  infrastructure/ — Prisma, Redis, logger
  middleware/ — Content moderation middleware
  queue/      — QStash job types & workers
  schemas/    — Shared Zod schemas
  ai/         — AI providers, spend cap, usage logging, quotas
  services/   — auth, rate-limit, email, moderation-SLA, soft-delete purge, etc.
  utils/      — Server actions, API helpers, validation
components/   — shadcn/ui primitives + feature components
prisma/       — Database schema (30 models)
test/         — Mocha unit tests (47 files)
```

See [CLAUDE.md](./CLAUDE.md) for architecture details and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the verified system reference.

## License

MIT &mdash; see [LICENSE](./LICENSE).<br>
Contributions welcome &mdash; see [CONTRIBUTING.md](./CONTRIBUTING.md).
