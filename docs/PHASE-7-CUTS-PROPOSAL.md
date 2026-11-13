# Phase 7 proposal — moat cuts/merges, cleanup, a11y, and performance

> **Status: implemented (2026-11-12).** This document is retained as the decision
> record for the cleanup that shipped in the Phase 7 implementation commit. The
> “proposal / no deletions in this step” language below describes the pre-approval
> state, not current behavior. See `CHANGELOG.md` for the shipped changes.

**Status:** Proposal for approval. **No deletions, no schema drops, and no behavior-removal code in this step.**  
**Branch:** `phase-7-cuts-proposal`  
**Scope:** Propose cuts/merges across the **11 moat capabilities** (and their preference toggles/gates), then—after approval—remove dead code/unused deps/duplicate docs, label AI scores as “AI-estimated”, and deliver WCAG AA + Core Web Vitals pass.

**Blocked/gated context:** Phase 6 remains blocked (requires explicit approval + `docs/PAYMENTS-PLAN.md`). This proposal does not include payments work.

## 1. The 11 moat capabilities (inventory) and proposed cuts/merges

| # | Moat capability | Current state (grounded) | User-facing toggle/gate today | Proposal | Rationale / KISS impact |
|---|---|---|---|---|---|
| 1 | **Verified Resolution** (human verify, provenance, staleness/trust decay) | `Thread.verifiedAt/By/lastVerifiedAt/isOutdated`, `markThreadVerified`, `ThreadResolutionCard`, `confidence-decay.ts`, cron scoring/skip logic | `verifiedResolutionEnabled` exists in prefs schema/defaults but UI states “always enabled”; `confidenceDecayEnabled` also in schema (not prominently surfaced) | **Keep core, merge/prune toggles.** Keep verification + trust-decay behavior as core quality signal. Treat `verifiedResolutionEnabled` and `confidenceDecayEnabled` as **always-on/internal** (remove redundant user toggles from schema/UI surface over time) rather than exposing dead controls. | Reduces settings complexity and avoids “toggle off trust” states. Core moat; must not regress correctness. Any toggle removal is a cleanup change (after approval) with safe default-on behavior preserved. |
| 2 | **Source Provenance 2.0** (tier/confidence/freshness/provider/cited sources) | `StreamingText` source drawer, source tier/labels in Phase 4 pipeline, citation validation | `sourceProvenanceEnabled` in schema; UI states “always enabled” | **Keep, merge toggle.** Keep provenance always visible in research answers; **deprecate/remove redundant toggle** in favor of default-on. | Provenance is essential for trust/anti-hallucination; toggling it off harms product integrity. Cleanup: remove unused gating branches if no real callers remain. |
| 3 | **Collections** (save threads/searches/snapshots, export) | Collections module/API/pages, `modules/collections/enabled.ts` (opt-out via `collectionsEnabled`), export/metadata handling | `collectionsEnabled` in schema + gate; UI states “always enabled” | **Keep core, simplify gate.** Retain Collections as core workspace feature; **converge on a single “always enabled” behavior** (remove opt-out toggle/gating complexity) unless a concrete cost/privacy need is proven. | Current gate + cache/invalidation adds complexity with little value if UI declares always-on. If usage/cost is negligible (DB-backed, free tier), prefer removal of toggle plumbing after approval. |
| 4 | **Graph Explorer** (thread relation graph, fork/embedding relations) | `/dashboard/graph`, `ForceGraphCanvas`, `ThreadRelation`, Phase 3 embedding-based relations, Phase 5 fork tree reuse | `graphEnabled` in schema; UI states “always enabled” | **Keep, merge toggle.** Keep graph/fork-visualization surfaces; **remove redundant toggle** and any dead conditional UI/routes only if truly unused (verify callers first). | Graph is a navigation/insight moat but already shipped; no user value in hiding it. Consolidate relation visualization (reuse one canvas/tree component pattern) rather than parallel implementations. |
| 5 | **Canvas** (side-by-side compare / research canvas) | `/dashboard/canvas`, collections canvas metadata (`graph|canvas|summary|ai_synthesis`), compare flows | No dedicated boolean in prefs schema; feature surfaced as route/capability | **Keep but scope/merge.** Keep compare as a focused utility; **merge overlap** with fork “parent-vs-fork compare” and collections snapshots to avoid parallel compare UIs. No net-new canvas complexity. | Canvas value is real but can sprawl; prefer one compare surface/pattern. Cut only duplicative entry points after approval if unused. |
| 6 | **Deep Research** (async multi-source, queued) | `GENERATE_DEEP_RESEARCH` job/route/types, queue worker/registry, `deepResearchEnabled` preference, spend/quota guards | `deepResearchEnabled` toggle exposed in settings | **Keep, tighten.** Keep as opt-in/guarded capability (free-tier/cost sensitive). **Do not cut**, but prune unused config paths and ensure UI/API gating is consistent and clearly quota-guarded. | High-cost feature relative to free quotas; toggle is justified. Merge any duplicate “advanced/deep” UX with Phase 4 Pro/Deep modes only if it reduces confusion without removing capability. |
| 7 | **Memory / Research Personalization** (`expertiseLevel`, inferred personalization) | `User.preferences.expertiseLevel`, `user-memory.ts` refresh, synthesis prompt injection, settings selector | Expertise selector (not a simple moat boolean) | **Keep, simplify.** Keep lightweight personalization; avoid expanding inference jobs/schemas. **Merge** personalization copy/controls into one clear settings area and ensure “AI-estimated/inferred” labeling where shown. | Low-cost, high-fit for synthesis quality. No toggle bloat needed; prune dead preference fields only if unused. |
| 8 | **KnowledgePage** (auto-promoted verified/public knowledge) | `KnowledgePage` model, promotion service/cron, `/k/[slug]` public route, sitemap/robots integration, embeddings on knowledge pages | No user toggle (system/eligibility-driven) | **Keep, harden boundaries.** Keep promotion/indexable knowledge pages (core compounding moat) with strict eligibility/noindex/privacy rules. **Cut/merge** only redundant promotion entrypoints if any (single canonical promotion path). | High SEO/compounding value; correctness and safety matter more than configurability. |
| 9 | **Community Jury** (appeals moderation via juror votes) | Appeal/AppealVote models, jury selection/tally/actions, admin/appeal routes and UI, moderation flow integration | No user toggle | **Keep, no merge.** Keep jury-based appeals for moderation integrity. **No cut.** Possible later simplification only if backed by usage/ops data (not assumed here). | Trust/safety-critical; removal risk outweighs maintenance. Not a “product moat toggle” to trim in Phase 7. |
| 10 | **Code Runner** (fenced JS/TS sandbox) | `/code-sandbox`, `components/thread/code-runner.tsx`, CSP/sandboxed iframe (`allow-scripts`, opaque origin, `connect-src 'none'`), Python placeholder-only | No user toggle | **Keep (scoped), no expansion.** Keep JS/TS sandbox as-is; keep Python placeholder-only (Pyodide/CSP incompatible on free/safe path). **Cut** any dead/unused runner affordances or misleading claims if found. | Useful learning/tooling moat with strong security boundaries; do not broaden attack surface or add paid/runtime deps. |
| 11 | **Fact-Check Badge** (`Message.factCheckStatus`) | `factCheckStatus` on messages/schema/types, UI/rendering touchpoints/hooks, AI/moderation/conflict-adjacent plumbing | No user toggle | **Keep, clarify labeling.** Keep status display but ensure it is presented as **AI-estimated/signal-based** (not authoritative truth) and only shown when backed by real status. **Merge** duplicate/confusing indicators if present. | Prevents over-trust; aligns with “AI-estimated” requirement. Cut only dead status paths (e.g. permanently `UNCHECKED` with no producer) if verified unused. |

### 11-item summary (decision requested)
- **Keep as core (with simplification/labeling):** 1, 2, 3, 4, 5, 7, 8, 9, 10, 11
- **Keep but tightly gated/cost-aware:** 6 (Deep Research)
- **Primary merges/cuts proposed (post-approval):** redundant preference toggles/gating for **Verified Resolution, Source Provenance, Collections, Graph, Confidence Decay** (schema/UI plumbing cleanup), duplicate compare surfaces around **Canvas/fork compare**, and any verified-dead code paths/docs across the 11 areas.

## 2. Cross-cutting cleanup (post-approval)

1. **Remove dead code / unused exports / unused dependencies** in the 11 areas only where proven unused (tree-shake/import/use-site audit + tests/build). No speculative deletions.
2. **Prune duplicate docs** (e.g. stale moat/plan references) and align canonical docs: `shared/ARCHITECTURE.md`, `docs/FORKING.md`, `docs/DEPLOYMENT.md`, `CHANGELOG.md` as needed.
3. **Preference/schema cleanup:** if toggles are merged to always-on/removed, keep backward-compatible parsing of stored JSON (ignore unknown/legacy keys) and avoid breaking existing users.
4. **Label AI scores as “AI-estimated”:** audit and update UI copy for resolution scores, AI summaries/synthesis confidence, fact-check/status indicators, and any score-like metrics to explicitly say “AI-estimated” (or equivalent) where not human-verified.
5. **WCAG AA + Core Web Vitals pass (scoped):** focus on Phase 2/4/5 and moat surfaces touched (public pages, AI search, fork/thread UI, settings, graph/canvas/code-runner containers): semantic headings/landmarks, labels/focus states/keyboard nav, contrast fixes, reduced layout shift/reserved space, image/font/loading hygiene, and avoid regressions in streaming/virtualized views.

## 3. Execution plan after approval (one committed phase)

1. **Branch/commit discipline:** one implementation branch/PR for approved Phase 7 scope; smallest safe commits inside if helpful, final clear phase commit(s) as requested.
2. **Code changes (approved subset only):**
   - Implement approved cuts/merges (toggle/gate removal, UI consolidation) with compatibility-safe preference parsing.
   - Delete verified-dead code/unused deps and duplicate docs identified during approval.
   - Add/adjust “AI-estimated” labels in relevant UI components.
   - Apply targeted a11y/CWV fixes on scoped surfaces.
3. **Verification:** run `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, `bun run audit:gate` (+ e2e for UI changes where feasible). Fix introduced issues; report failures honestly.
4. **Report:** Plan (≤10), Files changed, Tests added, Verification output, Risks/open questions.

## 4. Risks, constraints, and notes

- **No deletions in this step:** this document is proposal-only pending explicit approval of specific cuts/merges.
- **Do not break trust/safety surfaces:** Jury, KnowledgePage eligibility/noindex/privacy, Verified Resolution correctness, and provenance grounding must not regress.
- **Free tiers only:** no new paid services; avoid changes that increase cron/AI/storage cost.
- **Ambiguity called out:** the request specified “11 moat toggles”; implementation inventory shows **7 explicit moat booleans + other preference controls**, while the architecture defines **11 moat capabilities**. This proposal covers all **11 moat capabilities** (and their toggle/gating state) to satisfy intent comprehensively—**please confirm** if you want any item treated as “must-cut” vs “must-keep” before implementation.
- **Validation needed before deletion:** unused-dep/dead-code removal must be confirmed by repo-wide reference checks (not grep alone for dynamic usage) and passing gates.

## 5. Approval requested

Please approve (all/partial) so Phase 7 implementation can proceed:

- [ ] **Approve cuts/merges as proposed for capabilities #1–#11** (with noted keep/simplify/tighten decisions)
- [ ] **Approve removing redundant always-on toggles/gating plumbing** (`verifiedResolutionEnabled`, `confidenceDecayEnabled`, `sourceProvenanceEnabled`, `collectionsEnabled`, `graphEnabled`) while preserving default-on behavior and backward-compatible pref parsing
- [ ] **Approve scoped cleanup** (verified dead code/unused deps/duplicate docs) + **“AI-estimated” labeling** + **WCAG AA/CWV pass** on scoped surfaces
- [ ] **Specify any exclusions/modifications** (e.g. keep a specific toggle, do not touch Jury/Code Runner/Deep Research, etc.)

**Implementation will wait for explicit approval and will not start Phase 6.**