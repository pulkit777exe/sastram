# Architecture Review — Sastram

Date: 2026-08-31 · Scope: full codebase · Approach: `improve-codebase-architecture` skill (deepening pass)
> **Implemented 2026-10-11 (subagent workstreams, uncommitted):** D1 collections `withCollectionsHandler` + `policy.ts` + `SavePayload` + `MetadataKind` + `addManyToCollection` + `:bulk` route + `metadataHash` unique (all-or-nothing bulk, strict metadata per ADR-0001); D2/D3 same workstream. D4 `ThreadAccessPolicy` (`canRead/canWrite/canManage`, `require*OrThrow` returning context, `client.ts` pure views) + `members/` + `audit/` DELETED. D5 `ThreadSync` (`use-thread-sync`, `ai-inline-status` machine, pure `CommentTree`) + `thread-live-provider.tsx` DELETED (~250-line clone). D6 `ThreadSideEffectsPort` parity + `forkThreadDomain`/`ensureUniqueSlug` + moderation via port + reaction port. D7 `checkAiGuards`/`runGuardedAi`/`guardAiRoute` + `consumeQuota(kind)` + worker/cron adapters + `alreadyBilled` (ai-reply quota hole closed). D8 `executeAISearch(query, config, ctx)` + `lib/ai/text.ts` + citation `sourceId` render fix + warming cache fix. D9 folds + `toggleBookmark` deletion done inside D4/D2 work. Counts now 24 modules / 35 models / 50 routes / 61 test files. Decisions: docs/adr/0001-grilling-decisions.md.
>
> **Update 2026-10-11:** Re-audited. Counts now 26 modules / 35 models / 49 routes / 54 test files (was 29/35/46/53 on 2026-09-08). `C7` resolved — `modules/topics/` deleted, canonical flow is `CreateThreadDialog` → `createThreadAction`. `C1` dispatcher confirmed on disk (`modules/notifications/dispatcher.ts`). No `modules/admin/`, no `stores/`, no `lib/infrastructure/redis.ts` (Upstash REST only), no `lib/services/ai.ts` (AI lives in `lib/ai/`). Thread verification is the `markThreadVerified` server action (no `/api/threads/[threadId]/verify` route); no `/api/newsletter/generate` route.
>
> **Update 2026-09-08 (historical):** Re-audited. `C1` dispatcher now exists (`modules/notifications/dispatcher.ts` via `lib/queue/workers/ai-jobs: dispatch`), `C7` `createTopic` now delegates to `threads-write/createThread` (not duplicate `prisma.create`), `C3` no `newsletter/service.ts` file on disk (already removed), `C2` still split (invitations + members), `C4-C6,C8` still open. Counts drift fixed: 29 modules / 35 models / 46 routes / 53 tests (was 24/30/35/46). New moat: `Bounty`, `Poll.isMarket`/`resolvedOptionIndex`/`marketResolvedAt` markets, `Collection`+`CollectionItem` + `KnowledgePage` (resolutionScore>85+verifiedAt), `Thread.forkedFromId` + fork APIs (`/api/threads/[threadId]/fork`, `/api/threads/fork-external`), `Message.factCheckStatus` (`UNCHECKED`/`VERIFIED`/`DISPUTED`), `AppealVote` jury (3 random `MODERATOR`, 2/3 majority), Worker sandbox `code-runner`, `force-graph` canvas (`components/graph/ForceGraphCanvas.tsx` dynamic `import('force-graph')`, 360–560px, drag/zoom, `ThreadRelation` similarity ≥0.7), Deep Research advanced 12-source (`GENERATE_DEEP_RESEARCH`, `exaMode: agentic` + `tavilyMode: research`, Exa `numResults: 12`/`maxCharacters: 12000`, Tavily `max_results: 12`/`search_depth: advanced`), Canvas `crossReference` tier sort + conflict detection (`/dashboard/canvas?left=&right=`), verified resolution decay (`Thread.verifiedAt/By` + `lastVerifiedAt`, `modules/threads/confidence-decay.ts` 90d half-life, `computeConfidence` <0.5 → `isOutdated`), weekly `refreshUserExpertise` reuse in `update-threads` cron (`lib/services/user-memory.ts`, 50 active users, `threadDna.expertiseLevel` + `AiSearchSession.queryType` → `preferences.expertiseLevel` injected in `synthesis`).

> Domain vocabulary: see `UBIQUITOUS_LANGUAGE.md`. ADR-0001 exists at `docs/adr/0001-grilling-decisions.md` (2026-10-11).
> Architecture vocabulary: module, interface, implementation, depth, seam, adapter, leverage, locality (per the `codebase-design` skill).
> Past deepening: `refactor(search)`, `refactor(ai)`, `refactor(queue)`, `refactor: ports/adapters` — the team has been working through this for the last several commits. The candidates below are areas the recent refactor wave has not touched.

This is a survey pass, not a commitment. Pick one, grill it, deepen it.

## Legend

- **Strong** — clear deletion-test pass, multiple call sites suffering from the same surface. Ships leverage immediately.
- **Worth exploring** — surface smell is real but the refactor cost needs sizing before committing.
- **Speculative** — hypothetical seam; only deepen if a third caller appears.

---

## C1 · Deepen the Notifications dispatcher — RESOLVED 2026-10-11 (`dispatch()` in `modules/notifications/dispatcher.ts` is the single port; the description below records the pre-resolution state)

**Domain**: `modules/notifications/`
**Files**: `modules/notifications/dispatcher.ts`, `modules/notifications/repository.ts`, `modules/notifications/actions.ts`, plus callers (`modules/appeals/actions.ts`, `modules/follows/actions.ts`, `modules/messages/adapters/infra-side-effects.ts`, `modules/reports/actions.ts`, `modules/reports/service.ts`, `lib/queue/workers/ai-jobs.ts`)
**Strength**: Strong

**Problem (pre-resolution).** The interface was wider than the implementation. `repository.ts` exposed five primitives (`createNotification`, `createBulkNotifications`, `notifyUsersByRole`, `notifyMultipleUsers`, plus read filters), and every caller wired its own argument shape — the literal `{ userId, type: 'SYSTEM', title, message, data }` showed up in eight places. The implementation is small (Prisma writes plus a best-effort wrapper) but the surface is large: callers have to know which primitive to call for "notify a role" vs "notify these specific users" vs "notify a single user," and each one has its own argument shape.

**Deletion test.** Delete `modules/notifications/`. Have every caller write `prisma.notification.create` directly. Most callers wouldn't grow; a few would lose the "best-effort, never throws" wrapper. Pass-through with a real adapter hidden inside.

**Solution direction.** Collapse the five primitives into one port:

```ts
dispatch({ recipients: { userIds? | roles? | emails? }, category, title, message, data })
```

Recipients is a tagged union: pick one of three addressing modes. The fan-out (single user, multiple users, role lookup) hides in the implementation. Each caller writes one line. Tests cross the same seam — the dispatch shape — not five different function signatures. `notifyUsersByRole` became `dispatch({ recipients: { roles }, ... })` (shipped).

**Wins**: every caller gets simpler; the best-effort wrapper lives in one place; the read path is a separate concern; tests no longer have to mock 5 functions to test one notification.

---

## C2 · Merge Invitations and Members into one module — RESOLVED 2026-10-11 (`modules/members/` deleted; folded into `invitations/`)

**Domain**: `modules/invitations/` + `modules/members/`
**Files**: `modules/invitations/actions.ts`, `modules/members/actions.ts` (no `members/repository.ts` — direct prisma)
**Strength**: Strong

**Problem (pre-resolution).** Two adapters for the same domain concept. `inviteFriendToThread` (invitations) and `inviteMember` (members) both write to `ThreadInvitation` with overlapping rules — manageable-thread check, 7-day TTL, email-keyed dedup. Two adapters means a real seam exists, but it's in the wrong place: there is no `invitations/repository.ts`, so the seam is "the prisma table itself" and each adapter re-implements the deduplication transaction. `inviteMember` doesn't even send email; `inviteFriendToThread` does.

**Deletion test.** Delete `modules/members/inviteMember` and route its single caller (`access-management-modal.tsx`) through `inviteFriendToThread`. Complexity concentrates (one path) instead of vanishing — the *wrong* direction for a deletion-test pass; this is a real deep module, just split badly. Two-adapter test passes: there really are two things varying here (one with email, one without), and they share too much code.

**Solution direction.** Introduce `modules/invitations/repository.ts` (missing) owning `ThreadInvitation` writes, including the `findManageableThread` helper currently duplicated in both files. Members becomes a thin read module (access list, member listing) — its `removeMember` action delegates to the invitations repository. The seam is **Invitations (write) + Members (read)** instead of two parallel write adapters.

**Wins**: one place owns the dedup transaction; the `findManageableThread` helper stops being copy-pasted; the email-or-not decision becomes a single flag, not two parallel implementations.

---

## C3 · Delete `modules/newsletter/service.ts` (or extract the digest scheduler) — RESOLVED (`service.ts` is no longer on disk; the cron route owns the digest logic)

**Domain**: `modules/newsletter/`
**Files**: `modules/newsletter/actions.ts`, `modules/newsletter/service.ts`, `modules/newsletter/repository.ts`, `app/api/cron/daily-digest/route.ts`
**Strength**: Strong

**Problem (pre-resolution).** The interface is wider than it needs to be, and one half is fake. `service.ts:processPendingDigests` calls `getDueDigests()`/`markDigestProcessing()`/`completeDigest()` — all stubs in `repository.ts` returning empty arrays. Meanwhile the real digest logic lives in `app/api/cron/daily-digest/route.ts`, a 187-line route handler that does the same work end-to-end. `subscribeToThread` is duplicated in `service.ts:21` and `actions.ts:104` with the same body, and `scheduleThreadDigest` is a no-op stub on both call paths.

**Deletion test.** Delete `service.ts`. The cron route keeps working unchanged (it's standalone), and `subscribeToThreadAction` continues to work from `actions.ts`. Complexity concentrates in the right place. **This is a pass-through** — `service.ts` exists because someone planned a `DigestJob` model that was never built.

**Solution direction.** Either (a) delete `service.ts` outright — its only consumer is itself — or (b) split the real digest logic out of the cron route into `modules/newsletter/digest-scheduler.ts` with a proper `DigestJob` model behind it (the stubs imply the model was planned but not added). The two-adapter-vs-one-adapter test: today there is *one* real digest implementation (in the route) and a *fake* one (in service.ts). Extract to a single seam.

**Wins**: ~200 lines of dead code gone; the cron route gets a name and tests; the future `DigestJob` model has somewhere to live.

---

## C4 · Fold `modules/audit/` into `modules/activity/` — RESOLVED 2026-10-11 (`modules/audit/` deleted; `activity/` is the sole `UserActivity` writer)

**Domain**: `modules/audit/` + `modules/activity/`
**Files**: `modules/audit/repository.ts`, `modules/audit/index.ts`, `modules/activity/repository.ts`, `modules/activity/actions.ts`, `components/bootstrap-provider.tsx`, `app/(protected)/dashboard/admin/moderation/page.tsx`
**Strength**: Worth exploring

**Problem (pre-resolution).** Two modules share a single table (`UserActivity`). `audit/repository.ts:logAction` writes `{ type: action, entityType, entityId, userId, metadata }`; `activity/repository.ts:recordActivity` writes the same row with `{ type, entityType, entityId, userId, metadata }`. `audit:getUserActivities` and `activity:getUserActivity` are the same query with different filter shapes. No test surface on either side; the only thing keeping them apart is vocabulary.

**Deletion test.** Delete `audit/`, route `logAction`/`getUserActivities` callers through `recordActivity`/`getUserActivity` with renamed args. The vocabulary "audit log" stays at the call site as a comment, not a module boundary. **This passes the deletion test** — pass-through.

**Solution direction.** One `activity` module with two named operations: `recordEvent` (was `logAction`) and `recordProfileActivity` (was `recordActivity`). The `UserActivity` table already enforces `type` and `entityType` per the CHECK constraint; rows are shaped by the schema. Two-adapter test: one table, two writers, no semantic distinction.

**Wins**: one place to add metrics; the test surface becomes testable; the "audit" vs "activity" vocabulary distinction lives in function names, not file paths.

---

## C5 · Deepen Follows with a side-effects port (mirror messages)

**Domain**: `modules/follows/`
**Files**: `modules/follows/actions.ts`, `modules/follows/repository.ts`
**Strength**: Worth exploring

**Problem.** The interface is wider than the implementation. `followUser` in `actions.ts` reaches across three modules in sequence: `repository.followUser` (transaction with counter increment), then `dispatch()` (notifications dispatcher), then path revalidation. The repository hides a transaction. The action wires the side effect. If a future caller wants "follow without notification" or "follow + email digest signup," it duplicates the wiring. Messages already solved this with `MessageSideEffectsPort` (`modules/messages/ports/side-effects.ts`); follows has no equivalent seam.

**Deletion test.** Delete the notifications call inside `followUser` and verify the follow still works. The seam between "I am now following you" (follow) and "you should know I am following you" (notification) is implicit, on the wrong side of the seam.

**Solution direction.** Add `FollowSideEffectsPort` with `onFollowed({ follower, followee })`. The default adapter (mirroring `infra-side-effects.ts` for messages) handles the notification. The follow action becomes atomic from the caller's view: "follow someone, fire the event." Two adapters would be `infra-side-effects.ts` and a test stub — real seam, testable.

**Wins**: same shape as `messages/ports/side-effects.ts`; testable through the port; future "follow without email" use cases are adapter variants, not new code.

---

## C6 · Reclaim the Bookmarks surface (the test is reaching past the seam) — RESOLVED 2026-10-11 (`setBookmarkStatus` shipped; `toggleBookmark` deleted)

**Domain**: `modules/bookmarks/`
**Files**: `modules/bookmarks/actions.ts`, `modules/bookmarks/repository.ts`, `test/bookmarks.action.test.mts`
**Strength**: Worth exploring

**Problem (pre-resolution).** The interface is wider than it needs to be. Three actions expose three shapes (`toggleBookmark`, `getBookmarkedThreads`, `checkBookmarkStatus`) for one piece of domain logic ("a user has a set of bookmarked threads"). `toggleBookmark` is also read-then-write — a race with two tabs both checking and both inserting creates a double-row. The test (`test/bookmarks.action.test.mts`) reveals the smell: it reaches *past* the action into prisma to assert on positional vs object arg shape — a regression test for the action signature, not for the seam. **The interface is the test surface, and the surface is wrong.**

**Deletion test.** Delete `checkBookmarkStatus` (it's `toggleBookmark` minus the write). The remaining `toggleBookmark` still has the race. Deletion reduces surface but doesn't deepen — wrong module for a delete-only refactor.

**Solution direction.** One action: `setBookmarkStatus({ threadId, bookmarked: boolean })` that does an idempotent upsert/delete. The "has many" check belongs in a single read query that the dashboard page can hit directly via the repository (no action needed). The repository's `bookmarkThread` already uses `upsert` correctly — the action just doesn't.

**Wins**: race eliminated; one surface for the dashboard; test file shrinks to a single behaviour assertion.

---

## C7 · Reconcile `modules/topics/` and `modules/threads/createThreadAction` — RESOLVED 2026-10-11 (`modules/topics/` deleted; canonical flow is `CreateThreadDialog` → `createThreadAction`)

**Domain**: `modules/topics/` + `modules/threads/`
**Files**: `modules/topics/actions.ts` (46 lines), `modules/threads/actions.ts:createThreadAction`, `components/dashboard/create-topic-button.tsx`
**Strength**: Worth exploring

**Problem.** Two adapters for the same domain concept. `topics/actions.ts:createTopic` and `threads/actions.ts:createThreadAction` both create a `Thread`. They have different surfaces: `createTopic` is `FormData`-only with a tag list, `createThreadAction` is object-only with optional initial message and optional poll. There's one consumer each (`create-topic-button.tsx`, the thread page). The split is purely stylistic — there is no `topics/` repository or seam, just a second writer of the same row.

**Deletion test.** Delete `modules/topics/`. Have `create-topic-button.tsx` call `createThreadAction` with `tags` extended into the schema. Complexity concentrates (one place to add tag creation, no duplicated `buildThreadSlug`). Pass-through.

**Solution direction.** Merge the schemas and have one `createThreadAction` that accepts tags. The poll and initial-message fields already exist; tags are the only delta.

**Wins**: one writer of the `Thread` table; one place to evolve thread creation; the `topics/` directory is misleading (the schema calls them Threads).

---

## C8 · Add a Reaction side-effect port (skip unless a third caller appears) — RESOLVED 2026-10-13 (`ReactionDeps` port + `ReactionStore` shipped; `requireMessageAccess` replaced `authorizeMessage`)

**Domain**: `modules/reactions/`
**Files**: `modules/reactions/actions.ts`, `modules/reactions/repository.ts`
**Strength**: Speculative

**Problem (pre-resolution).** `actions.ts:authorizeMessage` is a hand-rolled "fetch message → resolve thread → enforce thread access" helper used by both `toggleReaction` and `getReactionSummary`. The same logic exists implicitly in messages actions but isn't named. Two adapters in shape, but only one consumer right now: reactions.

**Deletion test.** Delete `authorizeMessage` and inline the four lines into both call sites. No loss. **The seam is hypothetical** — single consumer means it's premature.

**Solution direction.** Speculative — only deepen if a third caller appears (e.g., reactions on drafts, ephemeral reactions in threads). Skip unless that pressure shows up.

---

## Top recommendation

**C1 (Notifications dispatcher)** is the strongest single move. Eight call sites hand-rolling the same payload shape, a best-effort wrapper scattered across the codebase, and the surface is wider than the implementation. Collapsing to a single `dispatch({ recipients, category, title, message, data })` port:
- removes the most duplication in one shot
- makes the notification wrapper live in one place (right now: in 5 functions)
- creates a real seam where today there are 5 hypothetical ones
- unblocks the C5 (Follows side-effects) work, which can mirror the new port

**C2 (Invitations + Members)** is the runner-up. The `findManageableThread` helper is duplicated, the dedup transaction is duplicated, and the seam is in the wrong place. A real deep module hidden behind two shallow adapters.

**C3 (Newsletter service deletion)** is a quick win — pure pass-through removal. ~200 lines of dead code disappear with no behavior change.

If you only do one: **C1**.

If you have appetite for two: **C1** + **C3** (C3 takes minutes; C1 is the deep module work).

If you want the architecture pass to land structural change: **C1** + **C2** + **C3** form a coherent deepening across three domains the recent refactor wave skipped.

## Cross-cutting observations

1. **The "ports and adapters" wave landed well in `messages/`, `search/`, and `ai/` but stopped at the module boundary.** Most `modules/<x>/` directories still use direct prisma writes inside actions. The notifications/follows/bookmarks areas are where the next port-adapter pass lives.
2. **The team's recent `refactor:` commits show a clear pattern: collapse shallow wrappers, find a single deep module behind them, delete the rest.** C1-C3 fit that exact pattern.
3. **ADR directory now exists** — `docs/adr/0001-grilling-decisions.md` (2026-10-11). Two of these candidates (C1, C2) involve decisions about vocabulary — "dispatch" vs "send" vs "notify", "invite" vs "add member". Worth capturing as ADRs before the deepening lands so a future reviewer doesn't re-litigate.
4. **`modules/reports/` shows up twice in the surface (C1) but wasn't a candidate on its own.** It's deep already; it just uses the shallow notifications surface. Fixing C1 makes the reports module strictly better.
## 2026-10-11 implementation log

| Candidate | Status | Evidence |
|---|---|---|
| D1 Collections request seam | ✅ Implemented | `modules/collections/handler.ts`, `policy.ts`, routes migrated; items-DELETE divergence closed |
| D2 SavePayload/MetadataKind | ✅ Implemented | `modules/collections/schemas.ts`, `metadata.ts` (+ client-safe split `metadata-hash.ts`) |
| D3 Bulk + uniqueness | ✅ Implemented | `addManyToCollection`, `:bulk` route, `metadataHash` unique + backfill script |
| D4 ThreadAccessPolicy | ✅ Implemented | `lib/thread-access.ts` Policy + `client.ts`; `members/` deleted |
| D5 ThreadSync | ✅ Implemented | `use-thread-sync`, `ai-inline-status`, pure `CommentTree`; `thread-live-provider.tsx` deleted |
| D6 SideEffects parity | ✅ Implemented | Extended port + infra/fake adapters, `forkThreadDomain`, moderation via port |
| D7 Guarded AI seam | ✅ Implemented | `lib/ai/guard.ts`, `ai-guard-route.ts`, `consumeQuota(kind)`, `alreadyBilled` |
| D8 AI-search pipeline | ✅ Implemented | `ports.ts` ctx injection, `lib/ai/text.ts`, citation fix, warming cache |
| D9 Shallow collapse | ✅ Implemented | `members/`→`invitations/`, `audit/`→`activity/`, `toggleBookmark` deleted |
| C2/C4/C6 (old) | ✅ Closed by D4/D9 | Superseded, verified via grep (zero imports) |

## 2026-10-13 v2 implementation log

| Candidate | Status | Evidence |
|---|---|---|
| H1 Injectable Policy | ✅ Implemented | `ThreadAccessStore` + `createThreadAccessPolicy` + fake store; 4 gates migrated; aliases deleted (16 files); alias tests → fake-store tests |
| H2 Thread-write consolidation | ✅ Implemented | `updateThreadDomain` (slug from write), backfill via `getThreadMessagesPaginated`, `createExternalForkDomain`, unified visibility enum |
| H4 Reaction port + pin | ✅ Implemented | `ReactionStore` (prisma + fake); `toggleReactionCore(input, deps)`; `createdBy` threaded to views; creator delete parity; DB-free toggle tests |
| T1 Fake-prisma seam | ✅ Implemented | `test/support/fake-prisma.ts`; 5 files migrated off bespoke save/restore |
| T3 Guard seam | ✅ Implemented | `GuardDeps` + `setGuardDepsForTests`; infra failures rethrow (500, not 403); route tests off `require.cache` surgery |
| A1 Cache ownership | ✅ Implemented | Expertise loads before cache read; route owns read+write on one key; service read-through for store callers |
| A3 Citation seam | ✅ Implemented | `text`-only synthesis; `citation-sources.ts` shared by export + metadata; saved syntheses persist citations |
| Appendix | ✅ Done | 7 worker shims deleted; polls validate shim deleted; visibility enum unified (poll-clock merge explicitly deferred) |

## 2026-10-13 follow-up: deferred items closed + hardening

| Item | Status | Evidence |
|---|---|---|
| Poll-clock merge | ✅ Done | `usePollRefresh` owns state only; `use-thread-polling` accepts `onTickExtra` driven on the single visible tick; `use-thread-sync` threads `onPollTick`; wrapper passes `refreshPoll` — one timer, hidden-tab paused |
| Warming personalization | ✅ Done | `fetchRecentSessionsForWarming` selects `userId`; `prewarmSingleSession` warms under owner expertise via `getUserExpertiseLevel` (shared with route); store get/put + ctx carry expertise; per-run memo (1 user read per user) |
| Security pass | ✅ Checked | No `dangerouslySetInnerHTML`; no key logging; sessions persist no keys; forum-search guards (auth+quota+rate limit) before spend, zod+sanitize+history cap+content-type+user-namespaced idempotency; collections export auth-scoped + escaped; fork auth + sanitized |
| Performance pass | ✅ Checked | Poll 2 timers→1; route expertise 2 reads→1; warming memo + early break on cap; full suite 478 passing / 12 pending / 0 failing in ~13s; `tsc --noEmit` clean |

## 2026-10-13 problem-fix pass (lint, audit, readiness)

| Problem | Disposition | Evidence |
|---|---|---|
| ESLint error: ref write during render (`use-poll-refresh.ts:31`) | ✅ Fixed | Ref synced in `useEffect`, not during render |
| ESLint error: `{}` empty-object type (`activity/repository.ts:54`) | ✅ Fixed | `Record<string, never>`; `tsc` clean |
| 5 lint warnings (dead `loadThreadContext`, unused `key` helper, unused `prisma`/`Role`/`canWriteThread` imports) | ✅ Fixed | `eslint .` zero problems |
| `bun audit`: `braces@3.0.3` high (GHSA-vfj7-8cjw-p6xm) | ⚠️ Accepted dev-only risk | No published fix (`audit fix`: 0 of 1 fixable); reachable only via `eslint-config-next` at lint time — never bundled (server-only externals) and globs come from our config, not user input; monitored by `bun audit` in CI |
| Dependabot `pnpm` ecosystem vs `bun.lock` | ✅ Fixed | Switched to `npm` ecosystem (monitors `package.json`; Dependabot has no Bun support); comment records `bun audit` as lockfile monitor |
| `check:prod` FAIL `BETTER_AUTH_SECRET` in local shell | ✅ Not a repo bug | Script validates runtime env; passes fully with proper env (`Production readiness checks passed`) |
| Prettier `--check` dirty in touched files | ⚠️ Pre-existing, left alone | All 9 files already dirty at HEAD; CI does not enforce `format:check`; whole-file rewrite would pollute diffs |
| Secret hygiene | ✅ Checked | No `.env` tracked (only `.example`/`.test` placeholders); no `sk-live`/`AKIA`/Slack tokens in tracked files; Gitleaks enforces on push via CI |
| Full suite after fixes | ✅ Green | 478 passing / 12 pending / 0 failing; `tsc` clean; `eslint` clean |

## 2026-10-13 security pass (50 routes + render + CSP)

| Area | Result |
|---|---|
| Route auth coverage (50 files) | ✅ All state-changing routes require session/guard/handler; only OTP verify, health, csp-report are intentionally public, all IP-rate-limited |
| IDOR (threads, polls, collections, AI summaries, search-history) | ✅ `requireRead/ManageOrThrow` or owner assertions on every object route; `guardAiRoute(threadId)` enforces read; `getSearchSession`/`softDeleteSearchSession` scoped by `session.user.id` |
| SSRF (`link-preview`) | ✅ `isSafePublicUrl` per redirect hop, manual redirect handling (max 3), 5s timeouts, IP rate limit; private/decimal/hex/octal/metadata hosts blocked |
| XSS (message render) | ✅ Custom React renderer (auto-escaped) + `isSafeUrl` scheme gate (`http/https/mailto`); server `sanitize-html` allowlist with `javascript:`/`data:` downgrade; no `dangerouslySetInnerHTML` |
| Uploads | ✅ Magic-byte sniffing + declared-type match + MIME allowlist (no SVG) + size/count caps + thread-write check + AI image moderation |
| SQL injection | ✅ Prisma parameterized queries only; `$queryRaw` uses template tags + `Prisma.join`, no string-built SQL |
| Cron / jobs auth | ✅ `verifyCronAuth` timing-safe, fail-closed without secret in prod; QStash `Receiver.verify` fail-closed; job dedup via Redis `SET NX` (var renamed `isDuplicate` → `shouldRun`, logic unchanged) |
| OTP abuse | ✅ IP-scoped `auth` rate-limit buckets on send + check; generic error messages (no account-oracle) |
| Secrets | ✅ No `.env` tracked; `.example` blank; no hardcoded keys in tree; Gitleaks on push |
| CSP (`proxy.ts`) | ✅ Fixed: added `worker-src 'self' blob:` (blob-Worker sandbox was dead in prod, silently falling back to main-thread eval), `object-src 'none'`; removed dev LAN IP; `buildCsp` exported with 4 locking tests (`test/proxy-csp.test.ts`) |
| Accepted risks | Click-to-run snippets execute poster code after explicit Run click (Worker has no DOM; `fetch` same-origin possible post-click — self-XSS class, code visible before run); `braces` dev-only CVE (no fix published) |

Verification: `tsc` clean, `eslint` clean, 482 passing / 12 pending / 0 failing (64 test files).

## 2026-10-14 implementation log (performance pass)

| Area | Change | Evidence |
|---|---|---|
| Indexes (P5+P2) | Migration `20261014000000_perf_hot_path_indexes` (validated: reset + replay of all 26 from zero on local pg17, zero-drift shadow diff, EXPLAIN confirms ban lookup + trgm bitmap usage): pg_trgm GIN lives in `prisma/extensions/pg-trgm.sql` (Prisma can't express GIN opclasses — keeping them in-history caused phantom `migrate dev` drift prompts); btree composites + 12 redundant-single drops in-history. Fixes pre-existing drift (`messages_parentId_idx` in history, absent from schema). Apply: `bun db:migrate` + `psql $DATABASE_URL_UNPOOLED -f prisma/extensions/pg-trgm.sql`. | prisma/schema.prisma + migration.sql + extensions/pg-trgm.sql (`prisma validate` clean) |
| Message page (P3) | Dropped unbounded `poll.votes` include (no consumer reads message.poll.votes; tallies via getPollResults) + parallelized reactions/liked tail (was 1 serial RTT). | modules/threads/threads-read/repository.ts |
| Search (P1) | Window `offset+limit+1` instead of `max(limit*5,200)` + dropped always-discarded parallel count in searchThreads/searchMessages/searchUsers (6 queries → 3 per unified search, ~10x fewer rows). | modules/search/repository.ts |
| Post path (P4) | `createMentionsForMessage` accepts `mentionsValidated` (skips 3rd same-ids existence query); moderation parent/history/thread fetches parallelized (3 serial → 1 round trip). | modules/messages/actions/{mentions,post}.ts, moderation-hooks.ts |
| Cron (P6) | Counter families run in parallel (5 sequential full-table passes → 1 wave); expertise refresh in allSettled chunks of 10 (50 serial cycles → 5 waves); report-context ban count skipped unless history capped at 5. | counter-reconciliation.ts, cron/update-threads/route.ts, reports/actions.ts |
| Graph (C2) | maxSim precomputed per link-set (was O(N×L) filter/reduce per node per 60fps frame). | ForceGraphCanvas.tsx |
| Polling (C4) | refreshPoll gates terminal polls (inactive/expired skip 2 actions/tick); summary + resolution intervals pause in background tabs without burning timeout budget. | use-poll-refresh.ts, thread-summary-card.tsx, ThreadResolutionCard.tsx |
| Clock (C1) | Shared 30s `useNow` ticker (components/ui/use-now.ts): TimeAgo, both poll clocks, resolution card off per-instance intervals (50+ timers → 1). 4 new tests. | TimeAgo.tsx, poll-panel/display.tsx, ThreadResolutionCard.tsx, test/use-now.test.tsx |
| Images (C6) | `sizes` on preview grid + banner; lazy on unoptimized scraper images. | ExternalLinkPreview.tsx, profile-header.tsx |

Deferred (surveyed, not taken): trending-score SQL rewrite (interface change), SSE token throttle + wrapper memoization (needs UX verification), framer-motion removal from poll components (visual regression risk), sampled counter reconciliation (cadence semantics).

Verification: `tsc` clean, `eslint` clean, 526 passing / 12 pending / 0 failing (was 522/12/0).

## 2026-10-14 implementation log (improve-codebase-architecture: Security + API + Opensource)

| Candidate | Status | Evidence |
|---|---|---|
| S1 AI-budget guard | ✅ Deepened (deletions) | Deleted dead `rateLimitFor` (lib/services/rate-limit.ts) + dead read-only `checkAiSpendCap` (lib/services/ai-spend-cap.ts); zero callers, zero tests; fixed stale `checkAiSpendCap` comment in ai-inline.ts. `lib/ai/guard.ts` confirmed as the canonical deep module (no new module needed). similar/route.ts GET hand-roll verified correct (pure read, no AI spend). |
| S2 Thread access + Ban | ✅ Implemented | `ThreadAccessStore.findActiveBan` (thread-scoped OR site-wide, expiry-aware) + prisma/fake adapters; single `evaluateWrite` shared by `canWrite`/`requireWrite` (removed inline duplication); banned writers denied even as creator/on PUBLIC, reads unaffected, MODERATOR/ADMIN bypass. 8 new tests (test/thread-access.test.mts). |
| S3 Exactly-once seam | ✅ Implemented | `claimOnce(key, scope, ttl?)` + `ttlForScope` in lib/services/idempotency.ts; job-dedup.ts is now a namespaced-key adapter over it (fail-open on Redis errors, was: threw → jobs 500). 6 new tests (test/exactly-once.test.mts). Exposed latent `.env`-over-`.env.test` merge via prisma.ts dotenv import (documented in test). |
| A1 Collection handler | ✅ Implemented | handler.ts owns `parseWith`/`readJsonBody`/`parseJsonBody`/`parseRouteId`/`parseQueryParam` (throw VALIDATION_ERROR 400 via withErrorHandling); all 8 collections routes migrated off hand-rolled safeParse plumbing. 8 new tests (test/collections-handler.test.mts). |
| A2 forum-search fat route | ✅ Implemented | 446 → 239 lines. Pure/protocol helpers extracted to modules/ai-search/route-helpers.ts (schema, key resolution w/ injectable fallbacks, pure message builders, cache/stream builders, error mappers; mapTopLevelError now passes AppError statuses through instead of flattening to 500). 12 new direct unit tests, zero require.cache mocks. |
| A3 v1 moderation seam | ✅ Implemented | appeals/submit drops duplicate schema (min 1 vs action min 10) + FormData translation, calls `submitAppeal({reason, reportId})` directly; review route drops inline status map. Both use shared `errorCodeToStatus` (added CONFLICT → 409 to lib/utils/api-response.ts). Action validation failures now 400, never 500. |
| A4 Poll resolve | ✅ Implemented | New `resolveMarketPollAction` owns the Poll Market invariant (existence/market/active/bounds/manage); route is transport-only (session/ratelimit/delegate). `getPollById` select gains `isMarket`. Client (poll-display) only checks res.ok + refetches — response-shape change safe. |
| O1 Contributor entry | ✅ Implemented | docker-compose: removed dead REDIS_URL/REDIS_HOST/REDIS_PORT + redis from app deps (zero code readers; redis kept under `tools` profile for experimentation); README/CONTRIBUTING mention `bun db:seed`, drop drifting counts, document Upstash-or-in-memory truth. |
| O2 Env collapse | ✅ Implemented | Schema gains DATABASE_URL_UNPOOLED/QSTASH_DEV/BLOB_URL/BETTER_AUTH_API_KEY; queue.ts, messages/schemas.ts, cron-auth.ts read via `env` (no raw reads); check-production-readiness.ts derives base verdict from `validateEnv()`, keeps deployment-only checks (CRON_SECRET required, prod-https, pairs, neon heuristics). New `resetEnvCache()` test seam; fixed `NODE_ENV = undefined` string-pollution in auth/cron tests; replaced env.ts require.cache eviction (module-instance fracture) with the reset seam. |
| O3 Public seam + seed | ✅ Implemented | RESEND_FROM default + .env.example neutralized to example.com; seed uses domain `buildThreadSlug` (deleted cloned slugify) and drops dead `icon` keys (no such column). |

Verification: `tsc` clean, `eslint` clean, 522 passing / 12 pending / 0 failing (was 490/12/0).

## 2026-10-13 accepted-risk fixes (sandbox + audit gate)

| Risk | Fix | Evidence |
|---|---|---|
| Click-to-run executes poster code with viewer session (`fetch` same-origin, `postMessage` forgery) | ✅ Neutered snippet scope | `components/thread/sandbox-prelude.ts`: `const`-shadow prelude undefines fetch/XHR/WebSocket/EventSource/WebTransport/BroadcastChannel/navigator/importScripts/self/globalThis/postMessage/onmessage/close/Function in worker runs, plus DOM/storage on the main-thread fallback; baked inline into the blob-worker source; 8 mechanism tests (`test/code-runner-sandbox.test.ts`) prove exfil/forgery/escape throw while benign code runs; Pyodide `js` bridge unregistered best-effort |
| Residual: indirect `eval` in dev | ⚠️ Contained | Prod worker CSP has no `unsafe-eval` (blocked); dev keeps it for HMR (localhost-trusted). Direct `eval` stays in neutered scope regardless |
| `braces` high CVE, no published fix | ✅ Enforced policy instead of acceptance | `scripts/audit-gate.ts` (`bun run audit:gate`, wired into CI replacing bare `bun audit`): fails on any non-allowlisted high/critical; `braces::GHSA-VFJ7-8CJW-P6XM` allowed only with dev-only justification + `reviewBy: 2027-04-13` expiry (verified: expired triage exits 1). Discovered bare `bun audit` exits non-zero on findings, so the old CI step was red-by-default with no policy — gate fixes that too |

Verification: `tsc` clean, `eslint` clean, gate passes, 490 passing / 12 pending / 0 failing (65 test files).

## 2026-10-19 implementation log (architecture + performance quality pass)

| Area | Change (committed) | Evidence |
|---|---|---|
| Queue reliability | `enqueueJob` reports `{status, ok}` so callers can tell inline/published/dropped apart; email is exempt from the per-run cap (it was silently dropping OTP/verification mail); retryable failures release their claim + dedup key so QStash retries are not deduped away; cron fan-out capped at `MAX_ENQUEUES_PER_RUN=150`; staleness checks enqueued and bounded to `STALE_MAX_BATCHES=50` | `lib/services/queue.ts`, `app/api/jobs/route.ts`, `app/api/cron/update-threads/route.ts`, `lib/queue/workers/ai-jobs.ts` (+ `queue-enqueue`, `jobs-route-retry` tests) |
| Billing correctness | Cron enqueues no longer pre-charge AI spend; `checkCronSpendCaps` reads without consuming (parallel); the daily digest filters recipients before rendering, memoizes per `thread:window`, bounds message fetches and evicts rejected generations | `lib/ai/guard.ts`, `app/api/cron/daily-digest/route.ts` (+ `cron-spend-caps` test) |
| AI guard + stream | Guard preserves `AppError` status (missing thread → 404, not 403), orders session → thread access → precheck → rate/quota/spend and returns a `ThreadAccessContext`; deep-research cost-classified at $0.08; `/@sai` stream replays an existing reply with no LLM call, reuses empty rows, folds depth into the parent select and loads context + AI user in parallel; `AbortError` is first-class with signal threading; forum-search caches before the guard and enforces a 25 s deadline | `lib/middleware/ai-guard-route.ts`, `app/api/threads/[threadId]/ai-reply/stream/route.ts`, `lib/utils/retry.ts`, `modules/ai-reply/service.ts` (+ 10 new test files) |
| Frontend perf | Thread context no longer carries the message array; rows compare element-wise so a streaming token re-renders only its row; `StreamingText` became a CSS animation-delay cascade; `FadeIn` drops framer-motion; FeedbackWidget/ForgotPasswordModal/Sentry replay lazy-loaded; React Query + cmdk removed with 9 dead components; thread page fetches in parallel; admin spend polling pauses on hidden tabs | `components/thread/*`, `components/ai-search/StreamingText.tsx`, `app/(protected)/dashboard/threads/[slug]/page.tsx` (+ streaming/component tests) |
| DB indexes | Migration `20261019000000_perf_owner_indexes`: 7 owner/feed composites added, 11 redundant singles dropped (rationale in the migration); `THREAD_SUMMARY_SELECT` narrowed; tag page shares the 7-day active-user window; relations refresh ordered by `updatedAt`; collections API window clamped (default 50, max 100); ai-search cursor `(createdAt, id)`; `scripts/apply-extensions.ts` replays pg_trgm SQL and is wired as `db:extensions` in package.json + CI | `prisma/schema.prisma` + migration, `scripts/apply-extensions.ts`, `app/api/collections/[id]/route.ts` |
| Dead code | ~1.5k lines removed: moderation dead vertical, `lib/services/reputation.ts`, `lib/ai/factory.ts`, route-experts API, activity/bounties actions, notification write shims, per-module unused symbols; `lib/actions/result.ts` shim deleted after migrating its last callers; unused `escalateStaleReports` removed | 44 files, +27/−1524 |
| Appeals seam | Pure `jury.ts` (tally/pick) + `repository.ts` extracted from `actions.ts`; 27 jury tests including exhaustive tally equivalence, 8 repository tests | `modules/appeals/{jury,repository}.ts` |
| API hardening | SSRF: bracketed IPv6 hosts are parsed so loopback/ULA/link-local/multicast/IPv4-mapped literals are actually blocked (the old patterns could never match `URL.hostname`), plus CGNAT and `0.0.0.0/8`; Prisma P2025→404, P2002→409, P2003→404 via one shared table with no raw codes; cleanup-blobs deletes only confirmed blob deletions and 500s on failure; health rate-limited with a 10 s public cache; messages/upload share `MAX_TOTAL_UPLOAD_BYTES` with a content-length 413 pre-check; OTP/auth routes log unexpected failures and return 500; `getRequestIp` everywhere | `lib/services/content-safety.ts`, `lib/utils/errors.ts`, `app/api/{health,messages,upload,cron/cleanup-blobs}/route.ts` (+ ssrf/errors/route tests) |
| Deps/CI | `@tanstack/react-query` + `cmdk` dropped; `bun run db:extensions` wired into CI after `db:deploy`; unused Redis service removed from CI; stale QStash `QSTASH_DEV` and worker-count comments corrected | `package.json`, `.github/workflows/ci.yml`, `.env.example`, `lib/queue/workers/index.ts` |

Deferred / accepted: `lastVerifiedAt` enrichment overload (~120-day cadence); duplicate digest producers (cron route + worker); Playwright e2e remains local-only; `prisma/extensions/apply-via-sql-editor.sql` stays a hand-maintained Neon payload (explicitly excluded from `db:extensions`); `MemberCount` dead column. The new index migration has not been applied to any database from this workspace (generated offline with `migrate diff`); CI replays all migrations plus `db:extensions` from zero.

Verification: `tsc` clean, `eslint` clean, 693 passing / 12 pending / 0 failing (86 test files; was 526 passing at the previous log).
