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

An discussion platform with AI-powered search, newsletters, and moderation. Originally a personal project, now open source.

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

Starts PostgreSQL, Redis, and the Next.js app. Local jobs run through the app's inline fallback unless QStash is configured. See [CONTRIBUTING.md](./CONTRIBUTING.md) for environment setup.

## Production checks

Before deploying, run the same gates CI expects plus the production readiness check:

```bash
pnpm typecheck
pnpm lint
pnpm build
NODE_ENV=production pnpm check:prod
```

`pnpm check:prod` validates required production environment variables, URL shape, QStash/Upstash pairs, and warns when optional AI/search infrastructure is missing. The Docker image uses Next.js standalone output and starts on `PORT` with `HOSTNAME=0.0.0.0`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full setup, [CLAUDE.md](./CLAUDE.md) for architecture details, and [docs/CANONICAL-REFERENCE.md](./docs/CANONICAL-REFERENCE.md) for the verified system reference.

## Project

- `/app` — Next.js App Router pages & API routes
- `/modules` — Domain logic (auth, threads, messages, search, moderation, ai, etc.)
- `/lib` — Core services, infrastructure (prisma, redis, qstash, rate-limit)
- `/components` — shadcn/ui primitives + feature components

MIT &mdash; see [LICENSE](./LICENSE).<br>
Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
