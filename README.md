<p align="center">
  <samp>
    <b>Sastram</b> · discussion and research platform<br>
    <sub>personal project · open source · built with next.js, prisma, websockets, ai</sub>
  </samp>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

---

An application with real-time chat forum like, AI-powered search, newsletters, and moderation. Originally a personal project, now open source.

## Tech

next.js, typescript, prisma (postgresql/neon), better-auth, websocket, bullmq (redis), google gemini / openai, tailwind css, shadcn/ui, tanstack query, zustand

## Quick start

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full setup and [CLAUDE.md](./CLAUDE.md) for architecture details.

## Project

- `/app` — Next.js App Router pages & API routes
- `/modules` — Domain logic (auth, threads, messages, search, moderation, chat, ai, etc.)
- `/lib` — Core services, infrastructure (prisma, websocket, bullmq, rate-limit)
- `/components` — shadcn/ui primitives + feature components
- `/worker` — Standalone BullMQ worker

MIT &mdash; see [LICENSE](./LICENSE).<br>
Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
