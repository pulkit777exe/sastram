# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Architecture Refactor (Rounds 1–4)

### Added

- **Thread editing**: OP/moderators can rename a thread and edit its description via a pencil dialog in the thread header (`updateThreadAction` — slug is kept stable so existing links don't break); title/description update in place with no page refresh
- **Header bookmark**: thread header now has an icon-only BookmarkButton seeded from the page's `isBookmarked` (no extra status round-trip)
- **Edit history viewer**: the "edited" label on messages is now clickable — prior versions load on demand in a small popover (the `getMessageEditHistory` action finally has a UI)
- **Thread tags visible**: the thread query already fetched user tags but nothing rendered them — they now show as clickable chips under the source preview (query extended with tag slugs; previously dead `TagChip` component now has its first importer)
- **Thread tag editing**: OP/moderators get inline attach/detach via `ThreadTagsManager` (search existing tags + attach, X to remove — optimistic with rollback, no refresh). New-tag creation stays admin-gated per existing server policy, and the picker says so
- **Contract tests**: `collections-cache` TTL/set/invalidate round-trips and `ROUTES.THREAD` shape now have unit tests (392 passing total)
- **E2E edit-flow spec**: `test/e2e/thread-edit.spec.ts` drives every new flow live against real Postgres — dialog create→navigate, message post→inline edit (URL unchanged), edit-history popover, title edit, tag attach/detach, reaction toggle, both AI status GETs — with zero page errors and no `Invalid input` toasts
- **Smoke spec repairs** (all 5 pre-existing failures fixed, full e2e 9/9 green): updated stale `Search with Sai` heading assertions to the current `Search across Sastram` UI, accepted the explicit missing-keys 400 on forum-search, seeded the long-missing fixture thread via new `scripts/seed-e2e-thread.ts` (wired into global-setup), and fixed the composer placeholder + icon-only send-button selectors
- **E2E safety fixes**: `global-setup` now pins `DATABASE_URL` to the test database for its seed steps (an unpinned run once wrote fixtures to the Neon dev DB — fully cleaned and verified empty); probe tag uses a valid cuid id; `TagChip` remove button gained an accessible name (also used by the spec for unambiguous targeting)

### Changed

- **Lighter reloads**: `ThreadSummaryCard` and `ThreadResolutionCard` poll new lightweight GET endpoints (`/api/ai/thread-summary`, `/api/ai/resolution-score`) instead of `router.refresh()` — waiting on AI jobs no longer re-renders the whole thread page every 3–4s
- **Correct route helper**: `ROUTES.THREAD(slug)` now returns `/dashboard/threads/${slug}` (the real route) instead of the `/thread/:slug` redirect — removes a redirect hop per thread link and makes tag/newsletter/polls revalidation hit the actual page
- **Deduped fork dialogs**: `ForkButton` + `ForkFromUrlButton` merged into `components/thread/fork-button.tsx` sharing one submit flow; both always navigate to the new thread instead of `router.refresh()`-ing into the old page
- **Deduped collections dropdown**: shared `useCollectionsDropdown()` hook (fetch + cache + dismissal + create) behind `CollectionSaveButton` and `BulkSaveButton`
- **Simplified thread actions**: removed the local `isRedirectError`/`failure()` copy in `modules/threads/actions.ts` — `createServerAction` already handles all of it
- **Simplified poll actions**: inlined single-use forwarder helpers (`fetchPollForVote`, `fetchPollForClose`, `applyVote`, `assertThreadAccess`) — bodies now call the repository / access check directly
- **Collection detail list**: `collection-item-actions.tsx` (per-row `router.refresh()`) replaced by client-owned `CollectionItemsList` — deletes filter local state instantly with rollback on failure, no page refresh
- **Dead code removal**: deleted unused `CreateTopicButton` + `modules/topics/actions.ts` (a duplicate thread-creation path nobody imported — canonical flow is `CreateThreadDialog` → `createThreadAction`)

### Fixed

- **No-op revalidations**: removed `revalidatePath` calls that targeted wrong paths — bookmarks (`/thread/<id>`), tags (`/thread/<id>`), `markThreadVerified` (`/dashboard/threads/<id>`), poll creation (id where slug expected); reactions/edit/pin/follow no longer invalidate broad trees (`/dashboard/threads`, `/dashboard`) per action — clients already reconcile optimistically
- **Reaction toggle truth**: `toggleReaction` now returns `{ hasReacted, likeCount }` so the optimistic like UI reconciles with the server instead of drifting on races

### Security

- **Search visibility**: `searchThreads` and `searchMessages` now apply `visibilityFilter()` — private/restricted threads no longer leak to unauthenticated search
- **Search authentication**: All three search actions now call `requireSession()` — previously no auth check at all
- **Search email exposure**: Removed `email` from user search selects and creator/sender includes
- **QStash fail-close**: Job signature verification now returns 503 in production when signing key is missing (was silently allowing unauthenticated job execution)
- **Error leaking**: Removed raw error objects from API response bodies — non-AppError messages now return generic "An internal error occurred"
- **Thread access on upload**: `/api/upload` and `/api/messages` now enforce `requireThreadWriteOrThrow` before file processing — any authenticated user could previously upload with a fabricated threadId
- **System user role**: Changed from `ADMIN` to `USER` — the system actor for auto-mod reports doesn't need admin privileges
- **AI user identity**: Documented `ai@sastram.system` as a reserved service identity

### Fixed

- **Server action args**: ~20 call sites across components and hooks now pass typed objects (`{threadId, cursor}`) instead of positional args — previously all returned `VALIDATION_ERROR` silently
- **Spend cap enforcement**: Sync routes (forum-search, thread-dna, thread-summary, resolution-score, similar, ai-reply) now call `enforceAiSpendCap(path)` which atomically checks AND increments — previously read-only `checkAiSpendCap()` left the counter unchanged
- **Double-charging**: Removed duplicate `consumeSpendCap()` calls in daily-digest, upload, and messages routes — expensive paths were billed twice
- **Infinite scroll**: Fixed cursor direction (`gt` → `lt` for DESC feed) — pagination re-turned the same window
- **Private thread leakage**: `listThreads` now filters by visibility + membership — all threads were previously visible to any authenticated user
- **Job retries**: Expected failures (AppError) now return 200 to QStash so it doesn't retry permanent errors — previously all failures returned 500 and retried 3x
- **Error propagation**: `listThreads` and `getUserNotifications` no longer swallow DB errors and return empty arrays — errors now propagate to the UI
- **Stream rendering**: Markdown `**bold**` now renders correctly during streaming — partial markers are stripped until their closing pair arrives
- **Member role**: `getMemberRole` now correctly returns `OWNER` only for thread creators, `MODERATOR` for global mods/admins
- **Role check**: Replaced hardcoded `['ADMIN','MODERATOR','OWNER']` with `canModerate()` — `OWNER` was never a valid Role enum value

### Changed

- **Quota services**: Collapsed four near-identical files (`ai-inline-rate-limit`, `ai-analysis-quota`, `image-moderation-quota`, `ai-search-quota`) into a single `createDailyQuota()` factory with explicit per-policy failure semantics
- **Authorization**: Consolidated into `lib/config/permissions.ts` as the single seam — `canModerate`, `isAdmin`, `requireAdmin`, `requireModerator`
- **Realtime layer**: Removed entire `modules/ws/` directory, no-op WebSocket publisher, `useThreadWebSocket` hook, and all `emit*` calls across messages, moderation, reactions, and stream route
- **Redis clients**: Merged `redis-connection.ts` + `redis-pubsub.ts` into single `redis.ts`
- **Dedupe removal**: Deleted `lib/dedupe.ts` (process-global cache with cross-request leakage) — replaced with React's request-scoped `cache()`
- **Queue dispatch**: All 9 job types now handled in `runJobInline` — previously 7 of 9 were silently dropped
- **Action framework**: Migrated `postMessage` and `invitations` actions to `createServerAction` — eliminates hand-rolled FormData parsing and error envelopes
- **Error envelopes**: Standardized all action returns to `{data, error, ok, errorCode}` — 16 sites previously returned short form missing `ok`/`errorCode`
- **Auth helpers**: Added `assertAdminOrThrow()` for API routes (throws AppError instead of redirecting)
- **Gemini models**: Default flash model changed from `gemini-3-flash-preview` (invalid) to `gemini-2.0-flash`; pro model from `gemini-2.5-pro` (paid) to `gemini-2.5-flash`
- **Type safety**: Replaced `as unknown as Record<string, unknown>` casts in queue.ts and email.ts; `jobHandlers` now uses discriminated union instead of `unknown`
- **Member role**: `getMemberRole` derives from `thread.createdBy === userId` instead of global role

### Removed

- **Dead code**: 35+ unused files deleted (~2,400 lines) including component subtrees, unused modules, empty stubs, and barrel files
- **Dead exports**: `PERMISSIONS` object, `canManageThreadAsUser`, `hasPermission`, unused notification functions, `getUserActivityStats`, `getFollowedUsersActivity`, `getMyReports`, `ModerationDashboard.resolveCase`
- **Deprecated aliases**: `requireThreadMembership` and `requireThreadMembershipOrThrow` (replaced by `requireThreadAccessOrThrow`)
- **Stubs**: 14 empty `export {}` files removed from modules/

### Performance

- **Pagination**: Uses denormalized `thread.messageCount` instead of `COUNT(*)` query on every page
- **Similarity**: Early termination when topic Jaccard < 0.3 — skips 250K in-memory comparisons in cron
- **Notifications**: Batch unread counts via `createMany` + grouped query instead of N+1
- **Rate limiting**: `messageLimiter` now resolves lazily instead of at module load

### Refactor

- **Module simplification**: 25+ modules cleaned — removed unused types, collapsed redundant repositories, extracted shared helpers
- **Infrastructure**: Extracted `visibilityFilter()` to `lib/thread-access.ts`, `toClientMessage()` mapper for SQL→UI shape conversion
- **Error handling**: Standardized `withErrorHandling` across AI routes; `failure()` helper preserves AppError codes
- **Job typing**: `JobHandlerMap` discriminated union replaces `Record<string, unknown>`

---

## [Unreleased] — Earlier Rounds (1–4)

### Testing

- Add API route integration tests — 25 tests covering auth enforcement, input validation schemas, rate limiting configuration, CRON security, and moderation validation
- Add QStash job handler tests — 11 tests for input validation across 8 job handlers
- Add component tests — 10 tests using React Testing Library for ErrorBoundary and OtpInput
- Test count: 298 passing

### DRY

- Replace 12 duplicated `hasMore: offset + limit < total` expressions with `computeHasMore()` helper
- Extract duplicated framer-motion animation variants into shared `lib/motion.ts`
- Consolidate file size constants to `FILE_LIMITS` in `constants.ts`

### Security (earlier)

- Add membership scoping to search API
- Add Zod validation to email OTP endpoints
- Replace raw client-supplied filenames with UUID-based keys in blob uploads
- Add regex complexity validation at moderation rule creation
- Escape regex special characters in email template variable keys

### Fixed (earlier)

- Rewrite `/api/cron/worker` endpoint with Queue.add() drain
- Wrap message creation + replyCount increment in `$transaction`
- Consolidate Upstash Redis singleton
- Add Lua script for atomic Redis INCR+EXPIRE
- Batch cron update-threads with cursor pagination

### Accessibility

- Add `aria-label`, `role`, and `aria-pressed` to like/reply/edit/delete/pin buttons
- Add `role="dialog"`, `aria-modal` to ApiKeysModal
- Add `role="log"` and `aria-live="polite"` to thread message scroll container
- Guard keyboard shortcuts from firing when focus is in form fields

### Added

- `ErrorBoundary` component for graceful degradation
- `OtpInput` reusable component
- `requireSectionMembership()` / `requireSectionMembershipOrThrow()` utilities
