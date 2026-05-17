# TODOS

## ✅ Completed

### WebSocket Cross-Instance Delivery Fixes

| TODO | Status |
|------|--------|
| 1. Redis user channels for cross-instance notifications | ✅ `publishUserEvent` publishes to `user:<userId>` Redis channel; WS server subscribes on-demand and forwards to local connections |
| 2. Instance ID + always-publish + loopback prevention | ✅ `INSTANCE_ID` via `crypto.randomUUID()`; `sourceInstance` in every Redis event; subscriber skips loopback; no early return |
| 3. Extract `unregisterSocket` function | ✅ Single cleanup function used by both thread and notification socket close handlers |
| 4. Expand `RedisThreadEvent` union + remove `as never` casts | ✅ Union expanded to 8 types; all `as never` casts removed |
| 5. Add error logging to empty `.catch()` handlers | ✅ Structured `logger.error` with threadId/error context replaces empty catches |
| 6. Unit tests for publish functions + Redis subscriber | ✅ 13 tests covering `unregisterSocket`, instance ID loopback, event payload shape, channel formatting |
| 7. Switch from `psubscribe` to selective channel subscriptions | ✅ Dynamic `subscribe`/`unsubscribe` per channel with ref-count tracking; no more all-instance fan-out |

### Broader Code Quality Fixes

| Category | Files |
|----------|-------|
| Race conditions wrapped in `$transaction` | `reactions/actions.ts`, `follows/repository.ts`, `bookmarks/repository.ts`, `reports/actions.ts` |
| N+1 queries batched | `badges/repository.ts`, `messages/actions/mentions.ts`, `moderation/actions.ts`, `topics/actions.ts` |
| Empty catch blocks → structured logging | `ai-search/cache.ts`, `websocket/server.ts` |
| `console.error` → `logger.error` | `server.ts` |
| Missing `select` added to Prisma queries | `notifications/repository.ts`, `chat/actions.ts` |
| `'Something went wrong'` → specific messages | `chat/actions.ts` |
| Dynamic imports → static imports | `lib/queue/workers/ai.worker.ts` |
| Membership check before expensive fetch | `app/api/ai/thread-dna/route.ts`, `app/api/ai/resolution-score/route.ts` |
| Dead code removed | `app/api/upload/route.ts` (commented-out S3 impl) |
| Idempotent delete (race condition fix) | `modules/tags/repository.ts` |

### Engineering Review — Codebase Audit Fixes (2026-05-17)

| # | Fix | Status |
|---|-----|--------|
| 1 | Centralized `requireSectionMembership()` utility — replaced 8 copy-pasted membership checks | ✅ |
| 2 | Rewrote cron/worker endpoint — replaced broken Worker-per-request with Queue.add() drain | ✅ |
| 3 | Wrapped message creation + replyCount increment in `$transaction` | ✅ |
| 4 | Made WebSocket upgrade handler synchronous — moved auth to post-connect | ✅ |
| 5 | Consolidated Upstash Redis singleton + Lua script for atomic INCR+EXPIRE | ✅ |
| 6 | Memoized rate limiters by bucket name — one instance per bucket | ✅ |
| 7 | AI worker throws error after DB write — BullMQ retries with exponential backoff | ✅ |
| 8 | Atomic Redis INCR+EXPIRE via Lua script (merged with Fix 5) | ✅ |
| 9 | `topics/actions.ts` — changed `requireSession(false)` to `requireSession()` | ✅ |
| 10 | Removed `role \|\| 'ADMIN'` fallback in moderation — added null check in `validateModerationTarget` | ✅ |
| 11 | `memberCount` data integrity — check affected rows before decrementing | ✅ |
| 12 | Notification IDOR — pass `userId` to `markAsRead` for ownership enforcement | ✅ |
| 13 | Added auth to badges and reputation actions — admin check for write operations | ✅ |
| 14 | Blob upload UUID key generation — prevents path traversal and file overwrites | ✅ |
| 15 | Regex complexity validation at rule creation — nesting depth, backreferences, nested quantifiers | ✅ |
| 16 | Email template variable escaping — escape regex special chars in template keys | ✅ |
| 17 | Batch cron update-threads with cursor pagination (100 per batch) | ✅ |
| 18 | Parallelize daily digest — group by thread, parallel summaries, batched email sends | ✅ |
| 19 | Added `select` to moderation rules loading — only fetch needed columns | ✅ |
| 20 | Cache email templates in Map at startup — eliminates repeated file I/O | ✅ |
| 21 | ThreadLiveWrapper state optimization | ⏸️ Deferred — requires significant refactor, lower priority than security fixes |
| 22 | ThreadContext for comment tree props | ⏸️ Deferred — requires significant refactor, lower priority than security fixes |

## 📋 Pending

### Engineering Review — Codebase Audit (2026-05-17)

#### 1. Fix Mock Tests
**What:** Update 5 test files that re-implement code locally to import from the real codebase.
**Why:** Tests currently verify mock implementations, not real code. If the real implementation diverges from the mock, tests pass but the code is broken.
**Pros:** Tests become meaningful; catches real regressions; no new dependencies.
**Cons:** Some tests may fail once they hit real code paths — requires fixing actual bugs the mocks hid.
**Context:** `test/actions.test.mts`, `test/websocket.test.mts`, `test/utils.test.mts`, `test/content-safety.test.mts`, `test/queue-config.test.mts` all define local copies of functions instead of importing from `lib/`. The `simple.test.mts` (1+1=2) should be deleted.
**Depends on:** None.

#### 2. API Route Integration Tests
**What:** Add integration tests for `/api/threads`, `/api/messages`, `/api/ai`, `/api/cron`, `/api/v1/moderation`.
**Why:** Zero API route test coverage. Auth bypass, membership gaps, and error handling bugs go undetected.
**Pros:** Catches security regressions; documents expected API behavior; validates auth/membership enforcement.
**Cons:** Requires test database setup; tests may be slow; needs mock for external services (AI, email).
**Context:** 31 route.ts files across 17 API groups. Critical paths: auth enforcement, membership scoping, error response shapes, rate limiting. Use the existing `test/setup.ts` and Mocha framework.
**Depends on:** None, but benefits from Fix 1 (real code imports).

#### 3. BullMQ Job Handler Tests
**What:** Add tests for all 9 job handlers: thread-summary, thread-dna, resolution-score, conflict-detection, daily-digest, ai-inline, email, staleness-check, ai-insight.
**Why:** Background jobs run silently — failures go unnoticed. The AI worker silently swallows errors (Fix 7).
**Pros:** Validates job processing logic; catches retry behavior; documents job input/output contracts.
**Cons:** Requires Redis mock or test Redis instance; AI jobs need mocked AI API responses.
**Context:** Jobs defined in `lib/queue/workers/`. Each job has specific input schema, retry config (3x exponential backoff), and output expectations. Test happy path, retry behavior, and error handling.
**Depends on:** None.

#### 4. Component Tests
**What:** Add React Testing Library tests for CommentTree, ThreadLiveWrapper, LoginForm, AISearch.
**Why:** Zero component test coverage. Critical user flows (message posting, auth, AI search) are untested.
**Pros:** Catches UI regressions; validates user interactions; documents component behavior.
**Cons:** Requires React Testing Library setup; mocking server actions and WebSocket is complex.
**Context:** 100+ components, zero tests. Start with the 4 most critical: CommentTree (recursive rendering, collapse/expand), ThreadLiveWrapper (WebSocket message handling), LoginForm (OTP flow), AISearch (multi-phase pipeline).
**Depends on:** None, but benefits from Fix 21 (ThreadLiveWrapper state) and Fix 22 (ThreadContext).

#### 5. Error Boundaries
**What:** Add React ErrorBoundary around CommentTree, ThreadLiveWrapper, AISearch, and app root.
**Why:** Any component failure crashes the entire app. No graceful degradation exists.
**Pros:** Isolates failures; shows user-friendly error UI; preserves rest of the app.
**Cons:** Adds ~50 lines of boilerplate; error boundaries mask bugs if overused.
**Context:** Use `componentDidCatch` class component or `react-error-boundary` library. Place at: app root (global fallback), CommentTree (message tree failure), ThreadLiveWrapper (WebSocket failure), AISearch (AI pipeline failure).
**Depends on:** None.

#### 6. DRY Consolidation
**What:** Consolidate duplicated patterns: Redis singleton logic (4 files), pagination response (10+ files), moderation/reports executors (2 files), file size constants (4 files), `getSecondsUntilUtcMidnight` (2 files).
**Why:** Copy-pasted code diverges over time. One fix needs to be applied in multiple places.
**Pros:** Single source of truth; easier maintenance; reduces bug surface.
**Cons:** Requires touching many files; risk of breaking existing behavior during refactor.
**Context:** Redis singletons in `lib/queue/connection.ts`, `lib/services/rate-limit.ts`, `lib/services/ai-search-quota.ts`, `lib/services/ai-inline-rate-limit.ts`. Pagination pattern `{ items, total, hasMore }` in 10+ repositories. Executors in `moderation/executors.ts` and `reports/executors.ts` are 95% identical.
**Depends on:** None.

#### 7. Accessibility Fixes
**What:** Fix 14 accessibility issues: missing aria-labels, keyboard navigation, focus-visible patterns, screen reader support for live messages, proper dialog semantics.
**Why:** App is unusable for keyboard-only and screen reader users.
**Pros:** WCAG compliance; better UX for all users; legal compliance.
**Cons:** Requires careful testing with screen readers; some fixes require component redesign.
**Context:** Key issues: like button has no aria-label, edit/delete buttons hidden on hover (no focus-visible), poll options lack role="radio", custom modal lacks role="dialog", keyboard shortcuts fire globally without input focus check, scroll container lacks role="log".
**Depends on:** None.

#### 8. Dead Code Cleanup
**What:** Remove unused logger imports (3 files), unexported/uncalled repository functions (15+), passthrough functions (requireModerationSession, requireReportsModeratorSession), re-export stubs (queries.ts, relations.ts), simple.test.mts.
**Why:** Dead code creates confusion, increases bundle size, and misleads maintainers about the codebase's capabilities.
**Pros:** Cleaner codebase; faster IDE indexing; reduces maintenance burden.
**Cons:** Some "dead" code may be planned for future features — need to verify before deleting.
**Context:** Files: `bookmarks/actions.ts`, `tags/actions.ts`, `badges/actions.ts` (unused logger imports). `notifications/repository.ts` (5 unexported functions), `audit/repository.ts` (5 unexported), `follows/repository.ts` (1 unexported). `moderation/policy.ts`, `reports/policy.ts` (passthrough functions). `threads/queries.ts`, `threads/relations.ts` (re-export stubs).
**Depends on:** None.

#### 9. Server Action Response Consistency
**What:** Standardize all server actions to return `{ data, error, errorCode, ok }` consistently.
**Why:** Client-side error handling is fragile — some actions return `errorCode`, some don't, some return raw objects.
**Pros:** Predictable client-side error handling; easier to write generic error UI; consistent API.
**Cons:** Requires updating 26+ action files; may break existing client code that depends on current shapes.
**Context:** `messages/actions/edit.ts` returns `{ errorCode, ok }`, `bookmarks/actions.ts` returns `{ data, error }` with no `errorCode`, `threads/actions.ts` returns `{ data: null, error: null }` with no `ok`. The standard shape is defined in `lib/utils/server-action.ts` but not all actions use it.
**Depends on:** None.

#### 10. Module index.ts Consistency
**What:** Fix 4 module index.ts files (audit, read-receipts, appeals, ws) that have stub `export {}` while their actions/repository files have real exports.
**Why:** Makes it unclear what the public API of each module is. Importing from `modules/audit` returns nothing.
**Pros:** Clear module boundaries; consistent import patterns; better IDE autocomplete.
**Cons:** May expose internal functions that were intentionally hidden; requires auditing each module's intended public API.
**Context:** `modules/audit/index.ts`, `modules/read-receipts/index.ts`, `modules/appeals/index.ts`, `modules/ws/index.ts` all export `{}`. Their `actions.ts` and `repository.ts` files have real exports. Other modules (bookmarks, badges, etc.) properly barrel-export.
**Depends on:** None.

#### 11. Missing Membership Checks on API Routes
**What:** Add membership checks to `/api/ai/thread-summary`, `/api/search`, `/api/threads`, and `/api/conversations`.
**Why:** Any authenticated user can access thread summaries, search results, and thread listings from sections they're not a member of. Data leaks across section boundaries.
**Pros:** Enforces the core authorization model; prevents cross-section data leakage.
**Cons:** May break existing integrations that expect open access; need to verify all callers have membership.
**Context:** `app/api/ai/thread-summary/route.ts` has `requireSession()` but no `SectionMember` check. `app/api/search/route.ts` searches across ALL threads/messages/users without scoping to user's memberships. `app/api/threads/route.ts` lists threads without verifying membership.
**Depends on:** Fix 1 (requireSectionMembership utility already exists).

#### 12. Email OTP Endpoints — Missing Input Validation
**What:** Add Zod validation and try/catch to `/api/sign-in/email-otp`, `/api/email-otp/send-verification-otp`, `/api/email-otp/check-verification-otp`, `/api/email-otp/reset-otp`, `/api/forget-password/email-otp`.
**Why:** No validation that `email` or `otp` are present or properly formatted. Malformed bodies cause unhandled exceptions. Internal error messages leaked to clients.
**Pros:** Prevents OTP spam attacks; graceful error handling; no internal details in responses.
**Cons:** Requires adding validation schemas to 5 route files.
**Context:** `app/api/sign-in/email-otp/route.ts:15-22` passes raw `request.json()` directly to auth API. `app/api/forget-password/email-otp/route.ts:31-34` leaks `error.message` to client.
**Depends on:** None.

#### 13. AI Jobs Endpoint — DELETE Has No Ownership Check
**What:** Add ownership verification to `DELETE /api/ai/jobs`.
**Why:** GET checks `jobDataPayload.userId` but DELETE allows any authenticated user to cancel any job. A malicious user could cancel other users' AI jobs.
**Pros:** Prevents unauthorized job cancellation; consistent with GET endpoint.
**Cons:** Cron jobs may not have a `userId` — need to handle that case.
**Context:** `app/api/ai/jobs/route.ts:96` — `await job.remove()` with no ownership check. GET handler at line 44 checks `userId` but DELETE does not.
**Depends on:** None.

#### 14. Message Edit History — No Authentication
**What:** Add `requireSession()` to `getMessageEditHistory` action.
**Why:** Anyone can view edit history for any message without authentication. While message content may be public, edit history reveals revision patterns that could be sensitive.
**Pros:** Consistent with other message-related actions; prevents scraping of edit patterns.
**Cons:** May be intentionally public — verify design intent before restricting.
**Context:** `modules/messages/actions/edit.ts:156-177` — no `requireSession()` call at all.
**Depends on:** None.

#### 15. Section Members Endpoint — No Authentication
**What:** Add `requireSession()` to `getSectionMembersAction`.
**Why:** Anyone can list members of any section without authentication. Exposes user membership patterns.
**Pros:** Consistent with other section-scoped operations; prevents enumeration attacks.
**Cons:** May be intentionally public for discoverable sections — verify design intent.
**Context:** `modules/members/actions.ts:151-156` — no `requireSession()` call.
**Depends on:** None.

#### 16. Non-Atomic System User Creation
**What:** Wrap system user check-then-create in `$transaction` or use `upsert`.
**Why:** Two concurrent moderation requests could both find no system user and both try to create one, causing a unique constraint violation.
**Pros:** Eliminates race condition; consistent with other atomic operations.
**Cons:** Minor — unlikely to occur in practice given low moderation volume.
**Context:** `lib/services/moderation.ts:329-341` — `findFirst` then `create` without atomicity.
**Depends on:** None.

#### 17. Hardcoded localhost in oAuthProxy
**What:** Derive `currentURL` from request or environment instead of hardcoding `http://localhost:3000`.
**Why:** OAuth flows may break in staging/preview deployments that aren't `localhost:3000`.
**Pros:** Works across all deployment environments; no manual config changes needed.
**Cons:** Requires adding `OAUTH_PROXY_URL` env var or deriving from request headers.
**Context:** `lib/services/auth.ts:33` — `currentURL: 'http://localhost:3000'` hardcoded.
**Depends on:** None.

#### 18. `as Record<string, unknown>` Type Casts in threads/service.ts
**What:** Replace unsafe type casts with proper Prisma select or typed DTOs.
**Why:** `modules/threads/service.ts:49,69,70,71,86` uses `as Record<string, unknown>` casts to access `aiSummary`, `likeCount`, `replyCount`, `isAiResponse`, `attachments`. These bypass type safety and will silently break if Prisma schema changes.
**Pros:** Type-safe access to fields; compile errors on schema changes.
**Cons:** Requires updating Prisma queries to include these fields in `select`.
**Context:** `modules/threads/service.ts` — 5 casts bypassing type safety.
**Depends on:** None.

#### 19. DRY: Pagination Response Pattern ✅ COMPLETED
**What:** Extract shared `computeHasMore()` helper for the `hasMore: offset + limit < total` pattern used across repositories.
**Why:** The pattern `hasMore: offset + limit < total` was copy-pasted across `bookmarks/repository.ts`, `activity/repository.ts`, `follows/repository.ts`, `search/repository.ts`, `users/repository.ts`, `moderation/actions.ts`, `appeals/actions.ts`.
**Status:** ✅ Applied `computeHasMore()` across 8 files. Full `paginatedResponse<T>` helper was already present but couldn't be used directly due to module-specific key names (`threads`, `messages`, `users`, etc.).
**Pros:** Single source of truth; easier to change pagination logic; consistent response shape.
**Cons:** Minor abstraction — the pattern is simple enough that duplication may be acceptable.
**Context:** 10+ repository functions with identical pagination response logic.
**Depends on:** None.

#### 20. DRY: Moderation + Reports Executors
**What:** Merge `modules/moderation/executors.ts` and `modules/reports/executors.ts` into a shared `executeAuditAndRevalidate()` function.
**Why:** The two files are 95% identical — both define `executeXxxAuditAndRefresh` with the same signature and behavior.
**Pros:** Eliminates duplicated abstraction; single place to modify audit behavior.
**Cons:** Requires updating import paths in both modules.
**Context:** `moderation/executors.ts:33-51` and `reports/executors.ts:5-23` — near-identical functions.
**Depends on:** None.

#### 21. DRY: File Size Constants
**What:** Consolidate file size limits (4.5MB, 5MB) defined in 4 files into `lib/config/constants.ts`.
**Why:** `content-safety.ts`, `blob.ts`, `file-upload.ts`, and `constants.ts` all define the same file size limits independently.
**Pros:** Single source of truth; easier to change limits.
**Cons:** Minor — constants are unlikely to change frequently.
**Context:** 4 files with duplicated file size constants.
**Depends on:** None.

#### 22. Dead Code Cleanup
**What:** Remove unused logger imports, unexported repository functions, passthrough functions, and re-export stubs.
**Why:** Dead code creates confusion, increases cognitive load, and misleads maintainers about the codebase's capabilities.
**Pros:** Cleaner codebase; faster IDE indexing; reduces maintenance burden.
**Cons:** Some "dead" code may be planned for future features.
**Context:**
- Unused logger imports: `bookmarks/actions.ts`, `tags/actions.ts`, `badges/actions.ts`
- Unexported/uncalled functions: `notifications/repository.ts` (5), `audit/repository.ts` (5), `follows/repository.ts` (1)
- Passthrough functions: `requireModerationSession` (moderation/policy.ts), `requireReportsModeratorSession` (reports/policy.ts)
- Re-export stubs: `threads/queries.ts`, `threads/relations.ts`
- `simple.test.mts` (1+1=2 test)
**Depends on:** None.

#### 23. Component Code Duplication
**What:** Extract shared components for repeated UI patterns.
**Why:** Poll creation logic duplicated in `poll-panel.tsx` and `inline-poll.tsx`. OTP input duplicated in `LoginForm.tsx` and `ForgotPasswordModal.tsx`. StatsCard pattern in 3 files. Motion animation variants in 5 files.
**Pros:** Less code to maintain; consistent behavior across features.
**Cons:** Requires careful abstraction to avoid over-generalizing.
**Context:**
- Poll creation: `components/thread/poll-panel.tsx:75-113` and `components/thread/inline-poll.tsx:46-85`
- OTP input: `components/auth/LoginForm.tsx:242-279` and `components/auth/ForgotPasswordModal.tsx:194-228`
- StatsCard: `components/dashboard/stats-card.tsx`, `components/admin/moderation-queue.tsx`, `components/user/user-stats.tsx`
- Motion variants: 5 dashboard files with identical animation definitions
**Depends on:** None.

#### 24. Accessibility Fixes (14 Issues) ✅ COMPLETED
**What:** Fix accessibility issues across components.
**Status:** ✅ All fixes applied across multiple rounds:
- aria-label/aria-pressed on like/reply/edit/delete/pin buttons
- focus-visible patterns on hidden-on-hover buttons
- role="radio" + aria-checked on poll options
- role="dialog" + aria-modal on ApiKeysModal
- Keyboard shortcut guards (input/textarea/select focus check) in moderation-dashboard and header
- role="log" + aria-live="polite" on thread message scroll container
- Switch ID uniqueness (settings- prefix to avoid collisions)

#### 25. Error Boundaries ✅ COMPLETED
**What:** Add React ErrorBoundary around CommentTree, ThreadLiveWrapper, AISearch, and app root.
**Status:** ✅ All error boundaries in place:
- `components/ui/error-boundary.tsx` — reusable ErrorBoundary class component
- `components/thread/thread-live-wrapper.tsx` — CommentTree wrapped in ErrorBoundary
- `app/(protected)/dashboard/ai-search/page.tsx` — SearchPage wrapped in ErrorBoundary
- `app/error.tsx` — Next.js global error boundary (pre-existing)
