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

### Added

- `lib/infrastructure/redis-upstash.ts` — shared Upstash Redis client, Lua script for atomic INCR+EXPIRE, and `getSecondsUntilUtcMidnight()` helper
- `requireSectionMembership()` — server action variant that redirects on failure
- `requireSectionMembershipOrThrow()` — API route variant that throws on failure

### Deferred

- ThreadLiveWrapper state optimization (useReducer/Zustand) — requires significant component refactor
- ThreadContext for comment tree props — requires significant component refactor
- Both tracked in TODOS.md for future implementation
