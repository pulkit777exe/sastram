# Documentation mismatches

**Purpose:** keep a running, evidence-based list of places where the docs disagreed
with the code. The code is the source of truth; this file records what was checked
and what changed.

**Last verified against code:** 2026-11-12 (Phase 1 truth repair, docs-only).

## Fixed in this pass

| Claim in docs | Where | What the code actually does | Disposition |
|---|---|---|---|
| Knowledge promotion is triggered by `POST /api/cron/promote-knowledge`. | `docs/PROMOTION_SYSTEM.md` | The route exports `GET`. Vercel invokes cron paths with a GET request. | Corrected to `GET`. |
| AI search is a fixed 5-phase pipeline using only Exa + Tavily, with a T1–T4 tier sort. | `shared/ARCHITECTURE.md` | `modules/ai-search/service.ts` runs a source registry: Sastram, Exa, Tavily, Hacker News, Stack Exchange, GitHub, arXiv, Wikipedia, and Wikidata, with per-source timeouts, canonical-URL dedupe, and reciprocal-rank fusion. Quick/Pro/Deep modes gate synthesis and sources. | Rewrote the pipeline section; list is illustrative and points at `modules/ai-search/adapters.ts`. |
| The directory tree lists only the original dashboard/public pages. | `shared/ARCHITECTURE.md` | `/q/[slug]`, `/k/[slug]`, `/code-sandbox`, `/privacy`, `sitemap.ts`, and `robots.ts` exist. | Added the missing public/knowledge and sandbox entries. |
| The data-model tables omit `KnowledgePage` and vector columns. | `shared/ARCHITECTURE.md` | `Thread` and `KnowledgePage` have nullable `embedding vector(768)` + `embeddingModel`; `KnowledgePage` is a separate model. | Added the model note/row. |
| The fact-check badge is visible on every message. | `shared/ARCHITECTURE.md` | `components/thread/message-list.tsx` renders a badge only for `VERIFIED` or `DISPUTED` messages. | Corrected to “shown on `VERIFIED` or `DISPUTED` messages”. |
| The Code Runner runs in a “same-origin iframe”. | `shared/ARCHITECTURE.md` | The document is served from `/code-sandbox`, but the iframe uses `sandbox="allow-scripts"` without `allow-same-origin`, so execution is in an opaque origin with `connect-src 'none'`. | Clarified the distinction. |
| Knowledge pages are promoted for verified high scores, but PUBLIC-only promotion is only an “intended” rule and a known gap. | `UBIQUITOUS_LANGUAGE.md` | `lib/services/knowledge-promotion.ts` filters `visibility: 'PUBLIC'`, `deletedAt: null`, `isOutdated: false`, `verifiedAt != null`, score > 85, and a non-empty `aiSummary`; it demotes pages that stop qualifying. | Updated the definition and example dialogue. |
| A ban is only thread-scoped. | `UBIQUITOUS_LANGUAGE.md` | `UserBan` supports thread-scoped and site-wide bans (`threadId` nullable) with optional expiry. | Updated the definition. |
| No domain term exists for a claim-level assertion. | `UBIQUITOUS_LANGUAGE.md` | No `Claim` model exists yet. Claim-level verification is planned for the trust loop. | Added **Claim** explicitly marked as planned/not in schema. |
| Audit evidence cites stale source line numbers. | `docs/AUDIT-REPORT.md` | The findings are implemented; line numbers have drifted. | Replaced line-number citations with pre-fix behavior descriptions. Tallies re-checked: 1 critical / 6 high / 8 medium / 3 low = 18 findings, including C9. |
| ADR-0001 refers to `docs/ARCHITECTURE-REVIEW.md` as if it still exists. | `docs/adr/0001-grilling-decisions.md` | The review log was moved to `docs/adr/0002-architecture-review-history.md`. | Updated the pointer. |
| README has no positioning, screenshot section, roadmap link, or good-first-issue guidance. | `README.md`, `CONTRIBUTING.md` | A roadmap and contribution guidance are useful entry points; the README described a generic discussion platform. | Rewrote README around the three pillars; added `ROADMAP.md` and a “Good first issues” section. |
| Moat UI is described as preference-gated. | `components/CLAUDE.md` | Collections/graph/verified-resolution/decay/source-provenance gates were removed in the Phase 7 cleanup; only deep research and challenge mode remain user-controlled. Legacy keys still parse. | Updated the component guide. |
| `/api/user/preferences` is documented as read/update. | `shared/ARCHITECTURE.md` | The route exports `GET` only; updates are the `updateUserPreferencesAction` server action. | Corrected the route description. |

## Verified with no change needed

- `shared/ARCHITECTURE.md` route inventory includes `/api/health/live` and
  `/api/bounties/claim`; both routes exist with the documented behavior.
- `/api/health/live` does not touch PostgreSQL or Redis; `/api/health` is the
  readiness probe.
- All four `vercel.json` cron schedules are daily and every cron route exports
  `GET` with `verifyCronAuth()`.
- Audit tallies and C9 are present and internally consistent; the report already
  states that Neon supports RLS and this project deliberately uses app-layer
  enforcement instead.
- `SECURITY.md` has supported versions, a disclosure timeline, a GitHub advisory
  path, and an email fallback; the Code Runner sandbox escape is in scope.
- `CODE_OF_CONDUCT.md` has a private reporting email.
- The Code Runner uses a real sandboxed iframe (`sandbox="allow-scripts"`, opaque
  origin, CSP `connect-src 'none'`, 3s timeout); Python remains a placeholder.
- Search privacy for `PRIVATE`/`FOLLOWERS_ONLY` profiles is enforced in the
  candidate query, not only on returned fields.
- `docs/adr/0002-architecture-review-history.md` is the preserved history of the
  former architecture-review log, and `shared/ARCHITECTURE.md` is the single
  current architecture reference.

## Known gaps / deferred (not Phase 1 doc fixes)

These are product or operational gaps captured here so later phases do not
rediscover them. Do not treat the docs as promising the missing behavior.

| Gap | Evidence | Phase |
|---|---|---|
| `update-threads` also invokes knowledge promotion, so promotion runs twice on days when both daily crons fire. | `app/api/cron/update-threads/route.ts` calls `promoteThreadsToKnowledgePages()`. | Phase 2 (remove duplicate if the standalone cron covers it). |
| Daily digest re-checks read access per thread (`filterReadableUserIds` in a per-thread map), not with one `visibilityFilter` query for the whole batch. | `app/api/cron/daily-digest/route.ts`. | Phase 2. |
| Password-reset routes and pages are live even though sign-in is email OTP + OAuth. | `app/(public)/forgot-password/*`, `/api/forget-password/email-otp`, `/api/email-otp/reset-otp`. | Phase 2 (remove or document why they stay). |
| Docker + Neon adapter path has not been exercised in a live container in this environment. | `docs/DEPLOYMENT.md` already documents the limitation. | Phase 2 verification. |
| `docs/FORKING.md`, `docs/PHASE-5-PREREQUISITES.md`, and `docs/PHASE-7-CUTS-PROPOSAL.md` were written as pre-implementation gates; the linked behavior has since shipped. | Git history and `CHANGELOG.md`. | Marked as historical/implemented in this pass. |
