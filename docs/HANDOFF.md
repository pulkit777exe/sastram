# Handoff — security / doc-hygiene / @sai cost-gating engagement

> **⚠️ HISTORICAL — pre-refactor handoff document.**
> Compacted context from the Phases 0–5 engagement (July 2026). The architecture
> refactor (August 2026) subsequently removed the WebSocket layer, consolidated
> quota services, and cleaned up dead code. See [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
> for current state.
>
> **Last updated:** 2026-08-11 (marked historical; retained for context)

## What was done (Phases 0–5)

- **Phase 0 — Shared understanding.** Repo is ground truth. Key discovery: the repo
  was already **public**, so Phase 1 became incident-response-but-clean.
- **Phase 1 — Secrets and security.** No real secret in 489 commits. Gitleaks added.
- **Phase 2 — Doc hygiene.** Reconciled docs vs code: 29 models, module count 26→25,
  removed nonexistent `modules/chat` refs.
- **Phase 3 — @sai cost gating.** Added cost classifier + hard gate seam
  (`lib/services/ai-cost-classification.ts`). Wired pre-flight spend-cap gate.
- **Phase 4 — Review.** Two-axis review. Fixed env-access violations.
- **Phase 5 — Handoff.** `docs/BACKLOG.md` (7 vertical slices, triaged).

## Post-refactor status (August 2026)

All 11 backlog slices are **RESOLVED**. The architecture refactor additionally:
- Removed `modules/ws/`, `modules/chat/`, `modules/reputation/`, `modules/badges/`
- Consolidated 4 quota services into `lib/services/daily-quota.ts`
- Added `modules/threads/access.ts` and `lib/actions/result.ts`
- Cleaned dead code from all domain modules

## Pending (as of refactor completion)

- **Backlog slices 1–5** — RESOLVED
- **WebSocket replacement** — Open design decision (SSE vs WS)
- **CSP flip to enforcing** — Pending report-log review

## Founder decisions (resolved)
- D1: Keep `/day` global AI spend cap, no monetization (reversible).
- D2: Cold-start = invited alpha cohort first, then broad public onboarding.

## Gotchas for future agents
- `SESSION-REPORT.md` / `STRATEGY-READOUT.md` were present at session start but are
  NOT in the working tree — do not rely on them.
- `.env` is gitignored and never committed; tests need `.env.test` when run locally.
- gitleaks pre-commit is graceful-skip if `gitleaks` binary absent locally.
- Current module count: 25 (verified: `find modules/ -mindepth 1 -maxdepth 1 -type d | wc -l`)
- Current API route count: 35 (verified: `find app/api/ -type f -name "route.ts" | wc -l`)
