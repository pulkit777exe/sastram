# Sastram Resolution Moat — KISS Plan v1

> **North star:** `shared/ARCHITECTURE.md:3` “questions get resolved, not just answered.”  
> **Bet:** Make resolution **unforgeable** + knowledge **compounding** — the two hardest-to-copy moats. Forum features don’t differentiate.

**Branch:** `plan/resolution-moat` · **Date:** 2026-09-06 · **Principle:** KISS — one seam, one table, one UI card per slice. Ship thin, learn.

---

## 0. KISS Guardrails

1. **One seam per slice.** A slice touches at most one new model / one new job / one new UI card. If it needs 2 tables, split it.
2. **Reuse the seam.** New feature = new consumer of existing `Thread.resolutionScore:217` / `AiSearchResult.sources:652` / `ThreadRelation` / `NotificationType.AI_INSIGHT:33` — not a parallel system.
3. **No parallel state machines.** `isOutdated` has 3 definitions today (`confidence-decay.ts` vs `ai-jobs.ts:204` vs `search-providers.ts:118`). Each slice aligns to **one** definition or replaces it — never adds a fourth.
4. **Server derives, client renders.** Scores, decay, similarity are computed server-side or as pure fns (`confidence-decay.ts:15`), UI only reads.
5. **Best-effort, never throw.** AI jobs already swallow quota (`_shared.ts`) → keep that. No slice may make `POST /api/threads` depend on Gemini.

---

## 1. Where We Are (ground truth)

### Resolution engine is real but under-surfaced
- **Score:** `Thread.resolutionScore Int? @index` `prisma/schema.prisma:217` + `lastVerifiedAt` `218` + `isOutdated` `219` + `threadDna Json?` `221` (`lib/schemas/thread-dna.ts`). Prompt `lib/ai/gemini.ts:152` returns 0-100, `lib/ai/helpers.ts:139` parses, `lib/queue/workers/ai-jobs.ts:74` writes + diff `>=20` → `AI_INSIGHT` notification. Cron `app/api/cron/update-threads/route.ts:46` batch 25, skips `score>=70 && fresh<24h` (`54`). **No OP verify, no validation, score decays only in UI** (`components/panels/ThreadResolutionCard.tsx:60` + `modules/threads/confidence-decay.ts:8` — “score NOT decayed, only confidence”).
- **DNA:** `lib/ai/gemini.ts:140` + `app/api/ai/thread-dna/route.ts:76` writes badges in `dashboard/threads/[slug]/page.tsx:166`. Used for `ThreadRelation` similarity `modules/threads/threads-relations/repository.ts:41` (topics 0.5 + questionType 0.3 + expertise 0.2, threshold `0.7`).
- **Relations:** `ThreadRelation` `prisma/schema.prisma:665` `similarity Float` exists but only `RelatedThreadsCard` linear list, no graph (`/dashboard/graph` missing).
- **Search:** 5-phase `app/api/ai/forum-search/route.ts:348` (classify → Exa+Tavily `search-providers.ts:256` → crossref tier sort `synthesis.ts:117` → synthesize max 400w `synthesis.ts:222` → cache `cache.ts:16` 6h/1h). `AiSearchSession:605` threaded via `parentSessionId` (`repository.ts:157`).

### Knowledge is siloed
- `UserBookmark:380` is single-thread only. No `Collection`. `modules/bookmarks/repository.ts:18` upsert is the seam to reuse.
- `AiSearchSession` + `AiSearchResult` persisted but never linked to threads. No Wiki, no export (only `exportUserData` JSON).
- `query-warming.ts:107` async pattern exists, but no user-initiated Deep Research job.

### Community is manual
- `followerCount:117` only; `reputation` table deleted (`20260711020000`). `Poll:536` single-vote, no market. `ThreadInvitation:587` manual only. `ThreadRelation` not used for forking.

### Trust is hidden
- `Source {tier 1..4, confidence, isOutdated, contentFetched} `modules/ai-search/types.ts:16` + `search-providers.ts:102` is computed but drawer `StreamingText.tsx:464` shows only `title||domain` + `domain` — no tier/freshness/confidence. `SourceCard.tsx:113` has tier badge but not wired.

---

## 2. Tier 1 — Make Resolution Unforgeable (ship first, 4-6 weeks)

### 1.1 Verified Resolution + Confidence Decay Timeline [P0]
**Problem:** Score is AI-only (`ai-jobs.ts:74`), `lastVerifiedAt` overloaded, no human signal, decay not persisted.
**KISS slice:**
- Add `Thread.verifiedAt DateTime?` + `verifiedBy String?` (FK User) — disambiguate from `lastVerifiedAt` (keep both; no destructive rename).
- Tighten `markThreadVerified` `modules/threads/actions.ts:147` to `canManageThread` (OP or ADMIN) + set `verifiedAt=now, verifiedBy=actor, isOutdated=false` and **keep** `resolutionScore` as-is (don’t auto-bump to 90; let AI re-score, human stamp is provenance, not inflation).
- Single writer for staleness: `isOutdated` now driven by `computeConfidence(verifiedAt ?? lastVerifiedAt)` (`confidence-decay.ts:15`) `<0.5` → outdated, not `updatedAt` heuristic. Remove `ai-jobs.ts:204` second definition.
- UI: `ThreadResolutionCard.tsx:60` sparkline of `effectiveScore = round(score * confidence)` + “Verified by OP 12d ago” provenance. No new table.
**Files:** `prisma/schema.prisma:217` (+2 cols, migration), `threads/actions.ts`, `ai-jobs.ts:204`, `confidence-decay.ts`, `ThreadResolutionCard.tsx`, `ThreadDetailsPanel`.
**Test:** `upsert thread → markVerified as OP → score unchanged but verifiedAt set → cron does NOT flip isOutdated for 30d`.

### 1.2 Source Provenance Drawer 2.0 [P0]
**Problem:** Tier/confidence hidden → trust moat not felt.
**KISS slice:** Wire existing fields into `StreamingText.tsx:464` drawer rows: `[Tier badge 25-46] + freshness TimeAgo/isOutdated orange + confidence% bar + provider dot + contentFetched check`. Reuse `SourceCard.tsx:113` and `TableView.tsx:50` styles, no new query.
**Files:** `StreamingText.tsx`, `modules/ai-search/types.ts` (already has fields).
**Test:** Drawer shows `T1:2 T2:5` for mixed fixture, confidence bar matches `source.confidence`.

### 1.3 Challenge Mode (interactive conflict) [P1]
**Problem:** `detect-conflicts` is passive (`ai-jobs.ts:130`).
**KISS slice:** `POST /api/threads/[id]/challenge {counterSourceUrl, note}` → enqueues existing `DETECT_CONFLICTS` job with `challengeSource`, re-scores, `dispatch` `AI_INSIGHT` to subscribers (`modules/notifications/dispatcher.ts:26`). No new job type, reuse `updateThreadStaleness` path.
**Files:** `app/api/threads/[threadId]/challenge/route.ts` (new 40 lines), `ai-jobs.ts:130`, `notifications/dispatcher.ts`.
**Test:** Challenge with contradictory Exa URL → `isOutdated=true` + notification.

### 1.4 Thread Relation Graph Explorer [P1]
**Problem:** `ThreadRelation` has no viz.
**KISS slice:** `/dashboard/graph` with `force-graph` (canvas, 1 dep) — nodes = threads, edges = `similarity>=0.7` (existing `getRelatedThreads:177`). Click → `/dashboard/threads/[slug]`. No new similarity calc, reuse `updateAllThreadRelations` cron.
**Files:** `app/(protected)/dashboard/graph/page.tsx` (new), `threads-relations/repository.ts` (read-only).
**Test:** Graph renders 5 nodes for fixture with 0.8 similarity.

### 1.5 Living Knowledge Pages — defer to Tier 2 slice 2.1
Too big for Tier 1 (needs new model). Keep Tier 1 to 4 slices max.

---

## 3. Tier 2 — Compounding Knowledge (differentiator, 6-10 weeks)

### 2.1 Collections / Workspaces [P0]
**KISS:** `Collection {id, userId, title, createdAt}` + `CollectionItem {collectionId, threadId? sessionId?}` (one table, two nullable FKs, `@@unique([collectionId,threadId])`/`[collectionId,sessionId]`). Reuse `bookmarkThread` upsert pattern (`modules/bookmarks/repository.ts:18`). UI: Save button in `ThreadDetailsPanel` + `SaiSearchLayout` history → “Add to collection”. Export: `POST /api/collections/[id]/export` → Markdown with `[n]` footnotes from `AiSearchResult` (reuse `SynthesisCard` markdown).
**Files:** `prisma/schema.prisma` (+2 models), `modules/collections/*`, `app/api/collections/*`.

### 2.2 Deep Research Mode (async) [P1]
**KISS:** New `AIJobType.GENERATE_DEEP_RESEARCH` (`lib/queue/config.ts:1`) + `QStash` 3-5 min job that reuses `executeAISearch` with `searchDepth: advanced` (`search-providers.ts:195`) and `take:20`. On done: `dispatch` + Resend email (`modules/newsletter`). Reuse `withAiPreflight` spend-cap + `runJobInline` fallback.
**Files:** `lib/queue/config.ts`, `workers/ai-jobs.ts` (+1 handler), `app/api/ai/forum-search/route.ts` (`mode=deep` branch).

### 2.3 Research Canvas [P2]
**KISS:** Split pane `/dashboard/canvas?left=threadId&right=sessionId` with AI diff (reuse `crossReference` tier sort + `detectConflictFromSources`). No new fetch, just render `sources` from `AiSearchResult:652`.

### 2.4 Personalized Sai Memory [P2]
**KISS:** `User.preferences:112` JSON already stores `{aiSummaryEnabled}` — add `expertiseLevel` inferred once per week from `threadDna.expertiseLevel` mode + `AiSearchSession.queryType`. Prompt injection in `synthesis.ts:222` `expertiseLevel` line.

---

## 4. Tier 3 — Retention (after compounding proves)

* **Reputation = Resolution** — derive `reputationScore` nightly from `UserActivity` + `Reaction.likeCount` + `isOutdated=false` threads authored; no new `reputation` table (it was deleted for a reason). Leaderboard `orderBy reputationScore` per `ThreadTag`.
* **Bounties** — reuse `AiUsageLog` ledger pattern + `ai-spend-cap.ts` Lua `CHECK_AND_INCR` for credit escrow; no wallet service.
* **Expert Routing** — `threadDna.topics` → query `UserActivity type=MESSAGE_CREATED` where `thread.tags` overlap → `ThreadInvitation.create` via `dispatcher` (reuse manual invite path).
* Others (forking, polls as markets) — each one table + one job, not Tier 1.

---

## 5. Tier 4 — Trust (hard to copy, but needs Tier 1 credibility first)

* **Fact-Check badge** — `Message` gets `factCheckStatus: verified|disputed|unchecked` computed by `detectConflicts` against thread `aiSummary` on `Message` create (reuse `moderation.ts` pipeline).
* **Jury** — `Appeal` 3 random `MODERATOR`s via `dispatcher` role fan-out, not single admin.

---

## 6. Sequencing & Milestones

**M1 (2 weeks):** 1.1 + 1.2 — Verified provenance + drawer. Ship behind `verifiedAt` flag, no breaking change.
**M2 (2 weeks):** 1.3 + 1.4 — Challenge + Graph (both read `ThreadRelation`/`AI_INSIGHT`).
**M3 (4 weeks):** 2.1 Collections + 2.2 Deep Research (needs `Collection` table + `QStash` job).
**M4 (optional):** 2.3 Canvas + 2.4 Memory.

Each milestone is demoable without the next.

---

## 7. Risks & KISS Mitigations

* **Drift:** `isOutdated` triple definition → single `computeConfidence` writer.
* **Spend:** Deep Research + Challenge could burn Gemini — gate both with `withAiPreflight` + `assertSpendCapAvailable` already in `ai-jobs.ts:76`.
* **History drift:** `ai_search_sessions.parentSessionId` threading already nests; Collections just points at it, no copy.
* **Notion export scope creep:** v1 is Markdown only; PDF/Notion are `export` adapters, not core.

---

## 8. Next Step (you asked subagents)

Four subagents audited `prisma/schema.prisma:217,665,605,380` + `forum-search/route.ts` + `ai.worker.ts` + `ThreadDnaCard`/`update-threads` — summaries above are their file:line-grounded output. Pick **M1** to start, or say “M2” and we’ll break 1.1 into tickets (`verifiedAt` migration + `markVerified` + decay alignment + sparkline) via `to-tickets`.
