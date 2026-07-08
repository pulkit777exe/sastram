<p align="center">
  <samp>
    <b>Sastram</b> · discussion and research platform<br>
    <sub>personal project · open source · built with next.js, prisma, ai</sub>
  </samp>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

---

An application with forum-like AI-powered search, newsletters, and moderation. Originally a personal project, now open source.

## Tech

next.js, typescript, prisma (postgresql/neon), better-auth, upstash redis, qstash, google gemini / openai, tailwind css, shadcn/ui, tanstack query, zustand

## Quick start

### Option A: Local setup

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

### Option B: Docker (recommended)

```bash
docker compose up
```

Starts PostgreSQL, Redis, the Next.js app, and background job processing in one command. See [CONTRIBUTING.md](./CONTRIBUTING.md) for environment setup.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full setup and [CLAUDE.md](./CLAUDE.md) for architecture details.

## Project

- `/app` — Next.js App Router pages & API routes
- `/modules` — Domain logic (auth, threads, messages, search, moderation, chat, ai, etc.)
- `/lib` — Core services, infrastructure (prisma, redis, qstash, rate-limit)
- `/components` — shadcn/ui primitives + feature components

MIT &mdash; see [LICENSE](./LICENSE).<br>
Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
