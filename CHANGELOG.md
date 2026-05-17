# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- Add centralized `requireSectionMembership()` and `requireSectionMembershipOrThrow()` utilities to `modules/auth/session.ts`, replacing 8 copy-pasted membership checks across routes, actions, and API endpoints
- Remove `role || 'ADMIN'` fallback in `validateModerationTarget()` that allowed moderators with null roles to bypass SUPER_ADMIN checks
- Fix notification IDOR vulnerability — `markNotificationRead` now passes `userId` to enforce ownership
- Add authentication to badge actions (`getUserBadgesAction`, `checkAndAwardBadgesAction`, `getAllBadgesAction`) — admin-only check for write operations
- Add authentication to reputation actions (`getUserReputationAction`, `syncReputationPointsAction`) — admin-only check for sync
- Replace raw client-supplied filenames with UUID-based keys in blob uploads to prevent path traversal and file overwrites
- Add regex complexity validation at moderation rule creation — checks nesting depth (max 4), backreference count (max 2), and rejects nested quantifiers like `(x+)+`
- Escape regex special characters in email template variable keys to prevent template injection and ReDoS

### Fixed

- Rewrite `/api/cron/worker` endpoint — replaced broken Worker-per-request pattern with Queue.add() drain that actually processes jobs
- Wrap message creation + replyCount increment in `$transaction` in `MessageService.processMessage()` to prevent data inconsistency
- Make WebSocket upgrade handler synchronous — moved auth to post-connect to prevent socket timeout crashes under load
- Consolidate Upstash Redis singleton into `lib/infrastructure/redis-upstash.ts` — eliminated 4 duplicated Redis connection patterns
- Add Lua script for atomic Redis INCR+EXPIRE operations — prevents orphan keys with no TTL on process crash
- Memoize rate limiters by bucket name — one instance per bucket instead of creating new instances on every check
- AI worker now throws error after writing error message to DB — BullMQ retries with exponential backoff instead of silently marking failed jobs as complete
- Change `topics/actions.ts` from `requireSession(false)` to `requireSession()` to prevent null crash for unauthenticated users
- Check affected row count before decrementing `memberCount` in `leaveSection` and `removeMemberAction` — prevents negative counts
- Add `select` to moderation rules loading — only fetch needed columns instead of full records
- Cache email templates in Map at startup — eliminates repeated file I/O on every email send
- Batch cron update-threads with cursor pagination (100 per batch) — prevents memory explosion with thousands of threads
- Parallelize daily digest — group subscriptions by thread, generate summaries in parallel, send emails in batches of 10

### Changed

- `removeMember()` repository function now returns `{ count: number }` to enable callers to check affected rows
- `validateModerationTarget()` now accepts `string | null | undefined` for moderatorRole and throws if role is missing
- `/api/cron/worker` response shape changed from `{ processed, failed }` to `{ processed, failed, total }`
- Replace 12 duplicated `hasMore: offset + limit < total` expressions with `computeHasMore()` helper from `lib/db/pagination.ts`

### Added

- `lib/infrastructure/redis-upstash.ts` — shared Upstash Redis client, Lua script for atomic INCR+EXPIRE, and `getSecondsUntilUtcMidnight()` helper
- `requireSectionMembership()` — server action variant that redirects on failure
- `requireSectionMembershipOrThrow()` — API route variant that throws on failure

### Deferred

- ThreadLiveWrapper state optimization (useReducer/Zustand) — requires significant component refactor
- ThreadContext for comment tree props — requires significant component refactor
- Both tracked in TODOS.md for future implementation

## [Unreleased] — Round 2

### Security

- Add membership scoping to search API — threads and messages now scoped to user's section memberships
- Add membership check to `/api/ai/thread-summary` — prevents accessing summaries of sections user isn't a member of
- Add ownership check to `DELETE /api/ai/jobs` — prevents users from cancelling other users' AI jobs
- Add authentication to `getMessageEditHistory` action — prevents unauthenticated access to edit history
- Add authentication to `getSectionMembersAction` — prevents unauthenticated member enumeration

### Fixed

- Use `upsert` for system user creation in moderation — eliminates race condition on concurrent moderation requests
- Replace hardcoded `localhost:3000` in oAuthProxy with `NEXT_PUBLIC_APP_URL` — OAuth works in staging/preview
- Replace unsafe `as Record<string, unknown>` casts in `buildThreadDetailDTO` with proper typed attachment mapping
- Add `sectionIds` parameter to `listThreads` for membership-scoped thread listing

### Changed

- `searchThreads` and `searchMessages` now accept optional `sectionIds` parameter for scoping results
- `ListThreadsParams` now supports `sectionIds` field for membership filtering
- `requireModerationSession` and `requireReportsModeratorSession` are now re-exports instead of passthrough wrappers

### Cleanup

- Remove unused `logger` imports from `bookmarks/actions.ts`, `tags/actions.ts`, `badges/actions.ts`
- Fix module index.ts stubs: `audit`, `read-receipts`, `appeals`, `ws` now properly barrel-export their public APIs

### Tests

- Rewrite `actions.test.mts` to import from real `@/lib/utils/server-action` instead of re-implementing locally
- Add `redis-upstash.test.mts` — tests for Redis singleton, UTC midnight helper, and Lua script
- Add `rate-limit.test.mts` — tests for rate limit config, memoization, and bucket behavior
- Add `moderation-regex.test.mts` — tests for regex complexity validation (nesting, backreferences, quantifiers)
- Add `bullmq-config.test.mts` — tests for queue names, job options, AI job types
- Add `email-template.test.mts` — tests for regex-safe variable interpolation
- Add `slug.test.mts` — tests for slugify edge cases
- Rewrite `utils.test.mts` to import real slugify, content-safety, rate-limit
- Fix `content-safety.test.mts` and `queue-config.test.mts` to use `@/` alias
- Delete `simple.test.mts` (trivial 1+1=2 test)
- Test count increased from 74 to 118 passing

## [Unreleased] — Round 3

### Security

- Add Zod validation to all 5 email OTP endpoints — prevents malformed body attacks and OTP spam
- Prevent internal error message leakage in OTP responses — no more `error.message` exposed to clients

### Fixed

- Merge moderation + reports executors into shared `executeAuditAndRevalidate()` — eliminates 95% duplicated code
- Consolidate file size constants to `FILE_LIMITS` in `constants.ts` — single source of truth across blob.ts, file-upload.ts, content-safety.ts

### Added

- `ErrorBoundary` component (`components/ui/error-boundary.tsx`) — graceful degradation for component failures
- Wrap `CommentTree` with `ErrorBoundary` in `ThreadLiveWrapper`

### Accessibility

- Add `aria-label` and `aria-pressed` to like button
- Add `aria-label` to reply button
- Add `aria-label` and `focus-visible` ring to edit/delete/pin buttons
- Add `role="radiogroup"` and `role="radio"` with `aria-checked` to poll options

### Tests

- Add `bullmq-config.test.mts`, `email-template.test.mts`, `slug.test.mts`
- Rewrite `utils.test.mts` to import real implementations
- Test count: 96 → 118 passing
