# Sastram Modules Security & Simplification Audit Report

**Date**: 2026-11-04
**Updated**: 2026-11-06
**Scope**: `modules/` domain code — 118 files across 24 modules
**Objective**: Identify security vulnerabilities, simplify duplication, and close exposure gaps.
**Deliverable**: Written report + implementation of critical/high severity fixes.

---

## 1. Executive Summary

The audit found **11 high/critical security findings** and **4 medium findings** across the module domain. Three categories of issues dominate:

| Category | Count | Impact |
|----------|-------|--------|
| **Authorization / Access Bypass** | 5 | Users can act beyond their privileges (edit moderated content, suspended users performing writes, privacy bypass) |
| **Data Exposure / Privacy Leaks** | 4 | Private data (bios, tag counts, thread metadata) leaks to unauthorized viewers |
| **Input Validation / Injection** | 3 | Unvalidated/unsanitized input enables injection, unbounded growth, or link exploits |

Two additional findings are **medium severity** (reliability/quality) and **2 are low-risk / design questions**. No active remote code execution or database compromise was found, but several issues are directly exploitable in production.

---

## 2. Critical Findings (Require Immediate Fix)

### [C1] Message Edit Bypasses Moderation
**File**: `modules/messages/edit.ts`
**Severity**: CRITICAL
**Impact**: A user can post benign content, then edit it to prohibited content (spam, harassment, threats) after the moderation gate has already passed. Unlike `post.ts` which calls `moderateIncomingMessage`, `edit.ts` only calls `sanitizeContent`, which does not perform the same moderation pipeline checks.

**Evidence**: `edit.ts` previously had no call to `moderateIncomingMessage`.

**Fix**: Added `moderateIncomingMessage` call before editing, mirroring the `post.ts` flow. The edit now goes through the same moderation pipeline. If moderation blocks the content, the edit is rejected.

### [C2] Suspended Users Partially Unblocked
**File**: `modules/auth/session.ts`
**Severity**: HIGH
**Impact**: `requireSession` / `requireSessionOrThrow` only blocks `status === 'BANNED'`, not `SUSPENDED`. Suspended users can create threads, edit profile, follow, vote, react, etc.

**Evidence**: `session.ts` lines 113-115: `if (checkBanStatus && session.user.status === 'BANNED') { redirect('/banned') }` — `SUSPENDED` is not checked.

**Fix**: Added `SUSPENDED` status check alongside `BANNED` in both `requireSession` and `requireSessionOrThrow`. Suspended users are now redirected to `/banned` (same as banned users) when `checkBanStatus` is true, and throw a `FORBIDDEN` error in `requireSessionOrThrow`.

### [C3] Visibility Leaks on Stale Bookmark References
**File**: `modules/bookmarks/repository.ts`
**Severity**: HIGH
**Impact**: `getUserBookmarks` returns thread metadata (name, slug, description, messageCount) for threads whose visibility may have changed since bookmarking. There is no re-check of `visibilityFilter` — a thread switched from public to private will still appear in a user's bookmarks list with full metadata.

**Evidence**: `repository.ts` fetched bookmarks with `include: { thread: ... }` but never applied a visibility filter.

**Fix**: Added `visibilityFilter` re-check in `getUserBookmarks`. The function now accepts `viewerId` and `viewerRole` parameters and applies the visibility filter when fetching bookmarked threads. Threads whose visibility changed after bookmarking are correctly filtered.

### [C4] Collection Items Leak After Visibility Change
**File**: `modules/collections/repository.ts`
**Severity**: HIGH
**Impact**: Saved collection items returned thread metadata (name, slug, AI summary) and message content for threads that had since become private. The collection owner could still read threads they no longer had access to.

**Fix**: `getCollection` now applies `visibilityFilter` inside the items query, with AND semantics over both the direct thread reference and the message's thread. Hidden items are excluded before `take/skip`, so pagination is also correct (no short pages or hasMore drift).

### [C5] Visibility Leaks on Stale Newsletter Subscriptions
**File**: `modules/newsletter/actions.ts`
**Severity**: HIGH
**Impact**: `getUserNewsletterSubscriptions` returns thread metadata (name, slug, description) for all subscribed threads without re-checking visibility. If a thread becomes private after subscription, the subscriber still gets email delivery of private thread content.

**Evidence**: `newsletter/actions.ts` fetched `threadSubscription` with `include: { thread: { select: { id: true, name: true, slug: true, description: true } } }` — no visibility re-check.

**Fix**: Added `requireReadOrThrow` per thread in the subscription list. Each thread's access is verified before including it in the results. Threads the viewer doesn't have access to are skipped.

### [C6] `listThreads` Default Leaks Private Threads
**File**: `modules/threads/list.ts` and `app/(protected)/dashboard/admin/page.tsx`
**Severity**: HIGH
**Impact**: `buildThreadWhereClause` applies no visibility filter when `memberUserId` is absent. The admin page called `listThreads()` with no viewer, returning all threads including private ones. While the admin page is admin-only, the default fail-open behavior is a design risk.

**Evidence**: `list.ts` lines: `if (!params.memberUserId) { return where; }` — no filter applied.

**Fix**: Changed the default visibility when `memberUserId` is absent to `PUBLIC` only. The admin page now passes `memberUserId: session.user.id` and `memberRole: session.user.role` to `listThreads()`, ensuring the visibility filter is applied via `canModerate` for admin viewers.

### [C7] Poll Cross-Thread Message Attachment
**File**: `modules/polls/actions.ts`
**Severity**: MEDIUM (upgraded from medium due to direct exploit risk)
**Impact**: `createPollAction` accepts `messageId` without verifying it belongs to `threadId`. A poll created for thread A can render in thread B via `getPollByThreadId` which resolves by `message.threadId`.

**Evidence**: `polls/actions.ts` line 141: `const poll = await createPollRepo(threadId, question, options, expiresAt ?? undefined, messageId);` — no cross-check.

**Fix**: Added verification that `messageId`'s `threadId` matches the specified `threadId` before creating the poll. If the message doesn't belong to the thread, the poll creation is rejected.

### [C8] Reaction Input Abuse
**File**: `modules/reactions/actions.ts` / `modules/reactions/store.ts`
**Severity**: MEDIUM
**Impact**: `toggleReactionSchema` validates `emoji` only as `z.string().min(1)` with no max length. The reaction store does not check `message.deletedAt` before persisting. `requireReadOrThrow` in the access check does not filter by user status (banned/suspended users can react).

**Evidence**: `actions.ts` line 15: `emoji: z.string().min(1);` — no max length. `reaction-store.ts` `resolveThreadId` fetches message without checking `deletedAt`.

**Fix**: 
- Added max length validation (`max(50)`) for emoji in the schema
- Updated `resolveThreadId` in the reaction store to check `message.deletedAt` and return `null` if the message is deleted
- Changed access check from `requireReadOrThrow` to `requireWriteOrThrow` to block banned/suspended users from reacting

### [C10] Profile Privacy Leaks via User Search
**File**: `modules/search/repository.ts`
**Severity**: HIGH
**Impact**: `searchUsers` selects/returns `bio` and matches on bio for `ProfilePrivacy.PRIVATE`/`FOLLOWERS_ONLY` users. A non-following user can search by terms that match a private user's bio, and the bio is returned in results even though the profile should be hidden.

**Evidence**: `search/repository.ts` lines 222-278: `scoreUser` weights `tokenScore(tok, user.bio) * 2` and the select includes `bio: true`; `searchUsers` returns `bio: true` in the select.

**Fix**: Modified `searchUsers` to exclude `bio` from the select for non-own-profile reads. Added `viewerId` and `viewerRole` parameters, and bio is only included in the select when viewing one's own profile. Privacy filtering is applied via `visibilityFilter`.

### [C11] Popular Tag Counts Leak Private Activity
**File**: `modules/tags/repository.ts`
**Severity**: MEDIUM
**Impact**: `getPopularTags` counts all `threadTagRelation` rows including private threads. The count reflects activity in threads that are not publicly visible, leaking metadata about private thread activity.

**Evidence**: `tags/repository.ts` lines 41-53: `getPopularTags` does `prisma.threadTag.findMany({ include: withThreadCount, ... })` — no visibility filter.

**Fix**: `getPopularTags` now runs a single `groupBy` over `thread_tag_relations` filtered by `visibilityFilter`, ranks the visible-only counts, and then fetches metadata for the top N tags. Counts are exact (no raw-count over-fetch) and the previous N+1 per-candidate count queries are gone.

---

## 3. Medium Findings

### [M1] AI Search Source URL Unsanitized Rendering
**File**: `components/ai-search/StreamingText.tsx`
**Impact**: `href={source.url}` is used unsanitized; provider mappings do not validate URL scheme. Potential `javascript:` link risk from provider/cached data.

### [M2] Suspension Duration Bug in Report Resolution
**File**: `modules/reports/service.ts`
**Impact**: `getBanExpiresAt` returns `null` for `SUSPEND_USER` without a duration, creating a never-expiring ban while status is `SUSPENDED`; `getRestrictionNotification` says "indefinitely". This is inconsistent — a SUSPENDED user should have a defined duration.

### [M3] Dead/Duplicated Code Candidates
**Files**: `modules/moderation/schemas.ts` (exports with no consumers), `modules/bounties/repository.ts` (only create/list/total, no claim path), `modules/threads/repository.ts` (`findRelatedThreads` re-export, internal usage only), `modules/threads/read.ts` (fragile information_schema workaround).

### [M4] Minor Bug — Error Code Mismatch
**Files**: `modules/reports/actions.ts` (createReport catches `requireReadOrThrow` error and returns `INTERNAL_ERROR` instead of `FORBIDDEN`), `app/api/invitations/accept/route.ts` (catches `requireSessionOrThrow` auth failure and returns 500 instead of 401), `modules/read-receipts/actions.ts` (swallows `AppError` and returns `INTERNAL_ERROR`), `modules/polls/actions.ts` `getPollResultsAction` calls repo before access check.

---

## 4. Low-Risk / Design Findings

### [L1] Invitation `senderId` Semantics
**File**: `lib/thread-access.ts` / `modules/invitations/repository.ts`
**Issue**: `ThreadInvitation.senderId` is the inviter, but `lib/thread-access.ts` treats it as an invitee id. Invitees are matched only by email, so changing email after acceptance loses access. Not an escalation because inviters are already managers, but it is incorrect/confusing.

### [L2] `SUSPENDED` vs `BANNED` in `app/banned/page.tsx`
The banned page already handles both statuses correctly (lines 18-20). No code change needed.

### [L3] No RLS on Neon
Per `lib/thread-access.ts`: "RLS note: row-level security is not enabled on Neon; access is enforced at the application layer." This is a deployment-time concern, not a code bug.

---

## 5. Fix Implementation Status

### Phase 1: Critical / High Severity Fixes (Implemented)

| Fix | File | Status |
|-----|------|--------|
| **C1** | `modules/messages/edit.ts` | ✅ Implemented — `moderateIncomingMessage` call added |
| **C2** | `modules/auth/session.ts` | ✅ Implemented — `SUSPENDED` check added |
| **C3** | `modules/bookmarks/repository.ts` | ✅ Implemented — `visibilityFilter` re-check added |
| **C5** | `modules/newsletter/actions.ts` | ✅ Implemented — `requireReadOrThrow` per thread added |
| **C6** | `modules/threads/list.ts` + `app/(protected)/dashboard/admin/page.tsx` | ✅ Implemented — default PUBLIC visibility + admin passes viewer |
| **C7** | `modules/polls/actions.ts` | ✅ Implemented — `messageId` cross-check added |
| **C8** | `modules/reactions/actions.ts` + `reaction-store.ts` | ✅ Implemented — emoji max length, `deletedAt` check, `requireWriteOrThrow` |
| **C9** | `modules/follows/actions.ts` | ✅ Implemented — conditional notification dispatch |
| **C10** | `modules/search/repository.ts` + `modules/search/actions.ts` | ✅ Implemented — bio exclusion, privacy filtering |
| **C4** | `modules/collections/repository.ts` | ✅ Implemented — visibility filter applied before pagination |
| **C11** | `modules/tags/repository.ts` | ✅ Implemented — exact visibility-filtered `groupBy`, no N+1 |

### Phase 2: Medium / Low Severity Fixes (Implemented 2026-11-05)

| Fix | Status |
|-----|--------|
| **M1** | ✅ `components/ai-search/StreamingText.tsx` — source URLs gated by `isSafePublicUrl` |
| **M2** | ✅ `modules/reports/service.ts` — 7-day default suspension, "7 days" in notification |
| **M3** | ✅ Dead code removed: unused `banUserSchema`/`deleteMessageSchema` (`modules/moderation/schemas.ts`), unused `findRelatedThreads` + related helpers (`modules/threads/relations.ts`), fragile `information_schema` probe replaced by direct `p."messageId" IS NULL` (`modules/threads/read.ts`) |
| **M4** | ✅ Error-code mapping: `modules/reports/actions.ts`, `modules/read-receipts/actions.ts`, `app/api/invitations/accept/route.ts`, `modules/polls/actions.ts` |
| **L1** | ✅ Implemented — `inviteeId` bound on acceptance; backfill migration for pre-existing ACCEPTED rows |

### Phase 3: Structural Simplification (Implemented 2026-11-05)

Dub-like flat domain modules — no subdirectories under `modules/`:

- **Threads**: `threads-core/repository.ts` → `threads/list.ts`; `threads-read/repository.ts` → `threads/read.ts`; `threads-write/repository.ts` → `threads/write.ts`; `threads-write/service.ts` → `threads/mutations.ts`; `threads-relations/repository.ts` → `threads/relations.ts`; `ports/side-effects.ts` → `side-effects.ts`; `adapters/infra-side-effects.ts` → `infra-effects.ts`
- **Messages**: `actions/{post,edit,delete,mentions,ai-inline,moderation-hooks}.ts` → flat `modules/messages/`; `ports/` + `adapters/` collapsed into `side-effects.ts` + `infra-effects.ts`; dead 1-line barrel `modules/messages/actions.ts` removed; consumers import `@/modules/messages`
- **Reactions**: `ports/side-effects.ts` + `adapters/{reaction-store,infra-side-effects,fake-side-effects}.ts` → `reactions/store.ts` + `reactions/effects.ts`
- Hand-rolled `{ data: null, ok: false, errorCode }` envelopes replaced by `actionFailure()` across `users/account-actions.ts`, `newsletter/`, `read-receipts/`, `messages/mentions.ts`, `feedback/`, `reports/`
- Search privacy: `viewerId`/`viewerRole` no longer accepted from the client schema; derived from session; `bio` stripped per-result for non-self profiles; unused `viewerRole` removed from `searchUsers`; `/api/search` users branch passes session viewer
- Bookmarks: `getBookmarkedThreads` passes session viewer so the visibility filter applies
- `.gitignore`: `docs/AUDIT-REPORT.md` now tracked

**Verification after restructure**: `bun run typecheck` clean, `bun run lint` 0 problems, `bun run test` 810 passing (2 dead-schema test assertions removed with the dead code), structure: `find modules -mindepth 2 -type d` → empty.

### Phase 4: Redis / Paid-Service Minimization (Implemented 2026-11-06)

- Health probe uses a per-instance limiter instead of shared Upstash, reuses the shared client, and caches the Redis `PING` (60s ok / 10s error) so platform probes do not burn the free-tier command budget.
- Cron spend caps share one Redis `GET` for the whole fan-out; cheap AI paths never touch Redis.
- Query warming is opt-in via `QUERY_WARMING_ENABLED` (default `false`), so speculative Exa/Tavily/Gemini spend only happens when deliberately enabled.
- Documentation updated in `.env.example` and `docs/DEPLOYMENT.md`; spend-cap tests updated.

### Phase 5: Bounty Claim Path (Implemented 2026-11-06)

- `claimBounties` settles every unclaimed row with one atomic `updateManyAndReturn` and returns the count/amount.
- `POST /api/bounties/claim` is restricted to the thread creator (moderators do not get a payout override), rate-limited, and requires read access first.
- The thread header exposes a Claim action to the OP when the unclaimed total is non-zero.

---

## 6. Files Modified (Critical/High Severity)

1. `modules/messages/edit.ts` — add moderation call
2. `modules/auth/session.ts` — add SUSPENDED check
3. `modules/bookmarks/repository.ts` — re-apply visibility filter
4. `modules/newsletter/actions.ts` — re-apply requireReadOrThrow
5. `modules/threads/list.ts` — default visibility filter
6. `app/(protected)/dashboard/admin/page.tsx` — pass viewer to listThreads
7. `modules/polls/actions.ts` — verify messageId belongs to threadId
8. `modules/reactions/actions.ts` — add emoji max length, rate limit
9. `modules/reactions/store.ts` — check deletedAt
10. `modules/follows/actions.ts` — conditional notification dispatch
11. `modules/search/repository.ts` — privacy filtering in searchUsers
12. `modules/search/repository.ts` — session-derived viewer, per-result `bio` strip
13. `modules/search/actions.ts` — schema slimmed (no client-supplied viewer fields)
14. `modules/tags/repository.ts` — exact visibility-filtered popular tag counts
15. `modules/collections/repository.ts` — visibility filter applied before item pagination
16. `modules/bounties/repository.ts` + `app/api/bounties/claim/route.ts` — atomic claim path
17. `components/thread/BountyButton.tsx` + header — OP claim affordance
18. `prisma/migrations/20261105000000_add_thread_invitation_invitee_id` — inviteeId column
19. `prisma/migrations/20261106000000_backfill_thread_invitation_invitee_id` — backfill for accepted rows
20. Structural flatten (see Phase 3)

---

## 7. Verification

After fixes, run:
- `bun run typecheck` — ensures no TypeScript errors ✅ (passes cleanly)
- `bun run lint` — ensures no lint violations
- `bun run test` — ensures existing tests pass ✅ (810 passing; 2 dead-schema assertions removed with the dead code they tested; the previously failing reaction DB-free test passes once the fake seam is used consistently)
- Manual review: verify suspended users cannot create threads/react/etc., verify private threads are properly filtered in bookmarks/newsletter, verify poll messageId is cross-checked, etc.

---

## 8. Known Remaining Gaps

- **Bounties**: the claim path is implemented (`POST /api/bounties/claim`, thread-creator only, atomic settlement). Refunds remain out of scope because there is no points ledger to debit/credit.
- **Deployment**: run `bun run db:deploy` so both invitation migrations (`inviteeId` column + backfill) reach Neon. The current `.env` password is rejected by Neon (`password authentication failed for user "neondb_owner"`); refresh the connection string from the Neon console before deploying.
- **Query warming**: intentionally off by default; set `QUERY_WARMING_ENABLED=true` only when the speculative search spend is budgeted.
- **RLS (L3)**: Neon has no row-level security; access remains enforced at the application layer by design.

---

**Total fixes implemented**: all 11 critical/high findings and all 4 medium findings are implemented; L1 is closed with `inviteeId` binding plus a backfill migration. The audit report is at `docs/AUDIT-REPORT.md`.