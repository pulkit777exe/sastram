<p align="center">
  <samp>
    <b>Sastram</b> · community-verified AI answers<br>
    <sub>ask · verify · fork · know</sub>
  </samp>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="./ROADMAP.md"><img src="https://img.shields.io/badge/docs-roadmap-grey" alt="Roadmap"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-grey" alt="Contributing"></a>
</p>

---

Sastram is a **community-verified AI answer engine**: ask a question, get a
streamed, cited, multi-source answer, then let people confirm, challenge, or
fork it. Verified answers become public, indexable knowledge.

## The three pillars

1. **Answer → verify → knowledge** — AI searches multiple sources, writes a cited
   answer, and the community verifies or challenges it before it becomes durable
   knowledge.
2. **Forking** — branch a discussion with a changed premise, revive a stale thread,
   remix an AI answer, or import an external link while keeping lineage visible.
3. **Multi-source search** — Sastram threads, web search, community sources,
   code, and academic sources are fetched in parallel, deduped, and fused into one
   answer with numbered citations.

## Screenshots

> Placeholder: add a short GIF of **ask → cited answer → ask the community to
> verify**, plus one still of a public knowledge page. Keep assets under
> `public/readme/` and reference them here.

```html
<!-- Example: <img src="./public/readme/ask-flow.gif" alt="Ask, cite, verify flow" /> -->
```

## Quick start

```bash
bun install
cp .env.example .env      # fill in the required values
bun db:migrate
bun run db:extensions     # idempotent pg_trgm indexes
bun db:seed               # optional demo content
bun dev
```

Or run the Compose stack (PostgreSQL + migrations + app):

```bash
docker compose up
```

The app container waits for `/api/health/live` before reporting healthy. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the environment-variable checklist and
troubleshooting.

## Verify

```bash
bun typecheck
bun lint
bun run test
bun run build
bun run audit:gate
bun test:e2e             # Playwright; needed when UI changes
```

CI additionally runs a Docker image build (against local PostgreSQL, not the
Neon adapter) and Playwright e2e. `bun test` is Bun's test runner — use
`bun run test` for the Mocha suite.

## Documentation

- [shared/ARCHITECTURE.md](./shared/ARCHITECTURE.md) — canonical architecture, data model, routes, jobs.
- [UBIQUITOUS_LANGUAGE.md](./UBIQUITOUS_LANGUAGE.md) — domain vocabulary.
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — release order, probes, crons, backups, rollback.
- [ROADMAP.md](./ROADMAP.md) — what is shipped, next, and gated.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup and good first issues.
- [SECURITY.md](./SECURITY.md) — reporting and disclosure policy.
- [docs/DOC-MISMATCHES.md](./docs/DOC-MISMATCHES.md) — docs verified against code.

## License

MIT — see [LICENSE](./LICENSE).
