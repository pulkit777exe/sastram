# Roadmap

Sastram is built in small, reviewable phases. Each phase ships behind its own
branch/PR and stops for review. This is a product roadmap, not a promise of
dates; `shared/ARCHITECTURE.md` describes what exists today.

**Current focus:** close the remaining security/correctness gaps before opening
more public surfaces or adding new product mechanics.

## Status

| Area | Status | Notes |
|---|---|---|
| Truth repair and canonical docs | **Done** | `shared/ARCHITECTURE.md` is canonical; `docs/DOC-MISMATCHES.md` records verified drift. |
| Security and correctness hardening | **Done (one environment check blocked)** | Audit C1–C11 are closed; digest access is one bounded snapshot per page; knowledge promotion has one trigger; password reset is documented and noindexed; Prisma adapter selection is explicit. Live Docker + Neon still needs a user with `docker` group access — see `docs/DEPLOYMENT.md`. |
| Public, indexable knowledge | **Shipped** | Server-rendered `/q/[slug]` and `/k/[slug]`, canonical URLs, sitemap, robots, OG images, QAPage JSON-LD, noindex rules. |
| Retrieval foundation | **Shipped** | pgvector embeddings, hybrid lexical/vector search, reciprocal-rank fusion, cached search, kNN-derived thread relations. |
| Multi-source search | **Shipped** | Source registry with Sastram, web, community, code, and academic sources; per-source timeouts; canonical dedupe; Quick/Pro/Deep modes. |
| Forking | **Shipped** | Unified `forkKind`, lineage, carry-over snapshots, external imports, supersede proposals, fork tree. |
| Legal, abuse protection, moderation | **Planned** | Privacy/Terms/Cookies/AI-use/DMCA drafts, data export/delete, Turnstile, new-account limits, report auto-hide. **Draft legal text is not legal advice.** |
| Claim-level trust loop | **Planned** | Claim/ClaimVote model, per-claim chips, correction/regeneration flow, score explanations, topic-scoped credibility. |
| First-run experience and seeded content | **Planned** | Ask-first landing, curated seed threads, guided “ask the community to verify” flow. |
| Cost control and fairness | **Planned** | BYOK path, per-user slice of the global AI cap, graceful degradation, conditional polling, backups. |
| UX polish | **Planned** | Command palette, mobile bottom sheet, composer slash commands, naming cleanup, notifications, WCAG AA, i18n-ready strings. |
| Observability and quality | **Planned** | Privacy-friendly analytics, AI quality dashboard, Playwright coverage for the core loop. |
| Money | **Gated** | Do not start without explicit approval and a reviewed `docs/PAYMENTS-PLAN.md`. Payments are not allowed on the Vercel Hobby plan. |
| Simplify | **Ongoing** | Propose cuts/merges; wait for approval before deleting behavior or data. |

## Constraints

- Free tiers only until the money phase explicitly starts.
- No paid services, no payment code, and no plan upgrades without approval.
- Respect API terms and attribution; do not scrape sites that forbid it.
- Legal text is a draft for lawyer review.
- Forward-only, idempotent migrations; never edit an applied migration.

## How to help

See [CONTRIBUTING.md](./CONTRIBUTING.md), especially “Good first issues”.
