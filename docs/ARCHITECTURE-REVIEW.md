# Architecture Review — Sastram

Date: 2026-08-31 · Scope: full codebase · Approach: `improve-codebase-architecture` skill (deepening pass)

> Domain vocabulary: see `UBIQUITOUS_LANGUAGE.md`. No `docs/adr/` directory yet.
> Architecture vocabulary: module, interface, implementation, depth, seam, adapter, leverage, locality (per the `codebase-design` skill).
> Past deepening: `refactor(search)`, `refactor(ai)`, `refactor(queue)`, `refactor: ports/adapters` — the team has been working through this for the last several commits. The candidates below are areas the recent refactor wave has not touched.

This is a survey pass, not a commitment. Pick one, grill it, deepen it.

## Legend

- **Strong** — clear deletion-test pass, multiple call sites suffering from the same surface. Ships leverage immediately.
- **Worth exploring** — surface smell is real but the refactor cost needs sizing before committing.
- **Speculative** — hypothetical seam; only deepen if a third caller appears.

---

## C1 · Deepen the Notifications dispatcher

**Domain**: `modules/notifications/`
**Files**: `modules/notifications/repository.ts`, `modules/notifications/actions.ts`, plus 8 callers (`modules/appeals/actions.ts`, `modules/follows/actions.ts`, `modules/members/actions.ts`, `modules/messages/adapters/infra-side-effects.ts`, `modules/messages/moderation-processor.ts`, `modules/reports/actions.ts`, `modules/reports/service.ts`, `lib/queue/workers/ai-jobs.ts`, `lib/services/moderation-sla.ts`)
**Strength**: Strong

**Problem.** The interface is wider than the implementation. `repository.ts` exposes five primitives (`createNotification`, `createBulkNotifications`, `notifyUsersByRole`, `notifyMultipleUsers`, plus read filters), and every caller wires its own argument shape — the literal `{ userId, type: 'SYSTEM', title, message, data }` shows up in eight places. The implementation is small (Prisma writes plus a best-effort wrapper) but the surface is large: callers have to know which primitive to call for "notify a role" vs "notify these specific users" vs "notify a single user," and each one has its own argument shape.

**Deletion test.** Delete `modules/notifications/`. Have every caller write `prisma.notification.create` directly. Most callers wouldn't grow; a few would lose the "best-effort, never throws" wrapper. Pass-through with a real adapter hidden inside.

**Solution direction.** Collapse the five primitives into one port:

```ts
dispatch({ recipients: { userIds? | roles? | emails? }, category, title, message, data })
```

Recipients is a tagged union: pick one of three addressing modes. The fan-out (single user, multiple users, role lookup) hides in the implementation. Each caller writes one line. Tests cross the same seam — the dispatch shape — not five different function signatures. The current `notifyUsersByRole` becomes `dispatch({ recipients: { roles }, ... })`.

**Wins**: every caller gets simpler; the best-effort wrapper lives in one place; the read path is a separate concern; tests no longer have to mock 5 functions to test one notification.

---

## C2 · Merge Invitations and Members into one module

**Domain**: `modules/invitations/` + `modules/members/`
**Files**: `modules/invitations/actions.ts`, `modules/members/actions.ts` (no `members/repository.ts` — direct prisma)
**Strength**: Strong

**Problem.** Two adapters for the same domain concept. `inviteFriendToThread` (invitations) and `inviteMember` (members) both write to `ThreadInvitation` with overlapping rules — manageable-thread check, 7-day TTL, email-keyed dedup. Two adapters means a real seam exists, but it's in the wrong place: there is no `invitations/repository.ts`, so the seam is "the prisma table itself" and each adapter re-implements the deduplication transaction. `inviteMember` doesn't even send email; `inviteFriendToThread` does.

**Deletion test.** Delete `modules/members/inviteMember` and route its single caller (`access-management-modal.tsx`) through `inviteFriendToThread`. Complexity concentrates (one path) instead of vanishing — the *wrong* direction for a deletion-test pass; this is a real deep module, just split badly. Two-adapter test passes: there really are two things varying here (one with email, one without), and they share too much code.

**Solution direction.** Introduce `modules/invitations/repository.ts` (missing) owning `ThreadInvitation` writes, including the `findManageableThread` helper currently duplicated in both files. Members becomes a thin read module (access list, member listing) — its `removeMember` action delegates to the invitations repository. The seam is **Invitations (write) + Members (read)** instead of two parallel write adapters.

**Wins**: one place owns the dedup transaction; the `findManageableThread` helper stops being copy-pasted; the email-or-not decision becomes a single flag, not two parallel implementations.

---

## C3 · Delete `modules/newsletter/service.ts` (or extract the digest scheduler)

**Domain**: `modules/newsletter/`
**Files**: `modules/newsletter/actions.ts`, `modules/newsletter/service.ts`, `modules/newsletter/repository.ts`, `app/api/cron/daily-digest/route.ts`
**Strength**: Strong

**Problem.** The interface is wider than it needs to be, and one half is fake. `service.ts:processPendingDigests` calls `getDueDigests()`/`markDigestProcessing()`/`completeDigest()` — all stubs in `repository.ts` returning empty arrays. Meanwhile the real digest logic lives in `app/api/cron/daily-digest/route.ts`, a 187-line route handler that does the same work end-to-end. `subscribeToThread` is duplicated in `service.ts:21` and `actions.ts:104` with the same body, and `scheduleThreadDigest` is a no-op stub on both call paths.

**Deletion test.** Delete `service.ts`. The cron route keeps working unchanged (it's standalone), and `subscribeToThreadAction` continues to work from `actions.ts`. Complexity concentrates in the right place. **This is a pass-through** — `service.ts` exists because someone planned a `DigestJob` model that was never built.

**Solution direction.** Either (a) delete `service.ts` outright — its only consumer is itself — or (b) split the real digest logic out of the cron route into `modules/newsletter/digest-scheduler.ts` with a proper `DigestJob` model behind it (the stubs imply the model was planned but not added). The two-adapter-vs-one-adapter test: today there is *one* real digest implementation (in the route) and a *fake* one (in service.ts). Extract to a single seam.

**Wins**: ~200 lines of dead code gone; the cron route gets a name and tests; the future `DigestJob` model has somewhere to live.

---

## C4 · Fold `modules/audit/` into `modules/activity/`

**Domain**: `modules/audit/` + `modules/activity/`
**Files**: `modules/audit/repository.ts`, `modules/audit/index.ts`, `modules/activity/repository.ts`, `modules/activity/actions.ts`, `components/bootstrap-provider.tsx`, `app/(protected)/dashboard/admin/moderation/page.tsx`
**Strength**: Worth exploring

**Problem.** Two modules share a single table (`UserActivity`). `audit/repository.ts:logAction` writes `{ type: action, entityType, entityId, userId, metadata }`; `activity/repository.ts:recordActivity` writes the same row with `{ type, entityType, entityId, userId, metadata }`. `audit:getUserActivities` and `activity:getUserActivity` are the same query with different filter shapes. No test surface on either side; the only thing keeping them apart is vocabulary.

**Deletion test.** Delete `audit/`, route `logAction`/`getUserActivities` callers through `recordActivity`/`getUserActivity` with renamed args. The vocabulary "audit log" stays at the call site as a comment, not a module boundary. **This passes the deletion test** — pass-through.

**Solution direction.** One `activity` module with two named operations: `recordEvent` (was `logAction`) and `recordProfileActivity` (was `recordActivity`). The `UserActivity` table already enforces `type` and `entityType` per the CHECK constraint; rows are shaped by the schema. Two-adapter test: one table, two writers, no semantic distinction.

**Wins**: one place to add metrics; the test surface becomes testable; the "audit" vs "activity" vocabulary distinction lives in function names, not file paths.

---

## C5 · Deepen Follows with a side-effects port (mirror messages)

**Domain**: `modules/follows/`
**Files**: `modules/follows/actions.ts`, `modules/follows/repository.ts`
**Strength**: Worth exploring

**Problem.** The interface is wider than the implementation. `followUser` in `actions.ts` reaches across three modules in sequence: `repository.followUser` (transaction with counter increment), then `createNotification` (notifications module), then path revalidation. The repository hides a transaction. The action wires the side effect. If a future caller wants "follow without notification" or "follow + email digest signup," it duplicates the wiring. Messages already solved this with `MessageSideEffectsPort` (`modules/messages/ports/side-effects.ts`); follows has no equivalent seam.

**Deletion test.** Delete the notifications call inside `followUser` and verify the follow still works. The seam between "I am now following you" (follow) and "you should know I am following you" (notification) is implicit, on the wrong side of the seam.

**Solution direction.** Add `FollowSideEffectsPort` with `onFollowed({ follower, followee })`. The default adapter (mirroring `infra-side-effects.ts` for messages) handles the notification. The follow action becomes atomic from the caller's view: "follow someone, fire the event." Two adapters would be `infra-side-effects.ts` and a test stub — real seam, testable.

**Wins**: same shape as `messages/ports/side-effects.ts`; testable through the port; future "follow without email" use cases are adapter variants, not new code.

---

## C6 · Reclaim the Bookmarks surface (the test is reaching past the seam)

**Domain**: `modules/bookmarks/`
**Files**: `modules/bookmarks/actions.ts`, `modules/bookmarks/repository.ts`, `test/bookmarks.action.test.mts`
**Strength**: Worth exploring

**Problem.** The interface is wider than it needs to be. Three actions expose three shapes (`toggleBookmark`, `getBookmarkedThreads`, `checkBookmarkStatus`) for one piece of domain logic ("a user has a set of bookmarked threads"). `toggleBookmark` is also read-then-write — a race with two tabs both checking and both inserting creates a double-row. The test (`test/bookmarks.action.test.mts`) reveals the smell: it reaches *past* the action into prisma to assert on positional vs object arg shape — a regression test for the action signature, not for the seam. **The interface is the test surface, and the surface is wrong.**

**Deletion test.** Delete `checkBookmarkStatus` (it's `toggleBookmark` minus the write). The remaining `toggleBookmark` still has the race. Deletion reduces surface but doesn't deepen — wrong module for a delete-only refactor.

**Solution direction.** One action: `setBookmarkStatus({ threadId, bookmarked: boolean })` that does an idempotent upsert/delete. The "has many" check belongs in a single read query that the dashboard page can hit directly via the repository (no action needed). The repository's `bookmarkThread` already uses `upsert` correctly — the action just doesn't.

**Wins**: race eliminated; one surface for the dashboard; test file shrinks to a single behaviour assertion.

---

## C7 · Reconcile `modules/topics/` and `modules/threads/createThreadAction`

**Domain**: `modules/topics/` + `modules/threads/`
**Files**: `modules/topics/actions.ts` (46 lines), `modules/threads/actions.ts:createThreadAction`, `components/dashboard/create-topic-button.tsx`
**Strength**: Worth exploring

**Problem.** Two adapters for the same domain concept. `topics/actions.ts:createTopic` and `threads/actions.ts:createThreadAction` both create a `Thread`. They have different surfaces: `createTopic` is `FormData`-only with a tag list, `createThreadAction` is object-only with optional initial message and optional poll. There's one consumer each (`create-topic-button.tsx`, the thread page). The split is purely stylistic — there is no `topics/` repository or seam, just a second writer of the same row.

**Deletion test.** Delete `modules/topics/`. Have `create-topic-button.tsx` call `createThreadAction` with `tags` extended into the schema. Complexity concentrates (one place to add tag creation, no duplicated `buildThreadSlug`). Pass-through.

**Solution direction.** Merge the schemas and have one `createThreadAction` that accepts tags. The poll and initial-message fields already exist; tags are the only delta.

**Wins**: one writer of the `Thread` table; one place to evolve thread creation; the `topics/` directory is misleading (the schema calls them Threads).

---

## C8 · Add a Reaction side-effect port (skip unless a third caller appears)

**Domain**: `modules/reactions/`
**Files**: `modules/reactions/actions.ts`, `modules/reactions/repository.ts`
**Strength**: Speculative

**Problem.** `actions.ts:authorizeMessage` is a hand-rolled "fetch message → resolve thread → enforce thread access" helper used by both `toggleReaction` and `getReactionSummary`. The same logic exists implicitly in messages actions but isn't named. Two adapters in shape, but only one consumer right now: reactions.

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
3. **No ADR directory yet.** Two of these candidates (C1, C2) involve decisions about vocabulary — "dispatch" vs "send" vs "notify", "invite" vs "add member". Worth capturing as ADRs before the deepening lands so a future reviewer doesn't re-litigate.
4. **`modules/reports/` shows up twice in the surface (C1) but wasn't a candidate on its own.** It's deep already; it just uses the shallow notifications surface. Fixing C1 makes the reports module strictly better.