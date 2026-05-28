# TODOS

> Last updated: 2026-05-28

---

## 🔍 Issues Found & Improvements Proposed

Issues and gaps discovered during the 2026-05-27 engineering review, along with the improvements implemented or proposed.

### Infrastructure & Architecture

| # | Issue | Improvement | Status |
|---|-------|-------------|--------|
| 1 | BullMQ workers ran inside Next.js HTTP server via `instrumentation.ts` — resource contention, no graceful shutdown, can't scale independently | Extract to standalone `worker/index.ts` with SIGTERM/SIGINT handlers, docker-compose worker service, `pnpm dev:worker` script | ✅ Done |
| 2 | 15+ API routes each used ad-hoc error formats (`{ error: '...' }`, `{ success: false, message: '...' }`, etc.) — clients forced to parse multiple shapes | Standardize all routes on `ok()/fail()` with uniform `{ success, error: { code, message }, metadata }` and 6 standard error codes | ✅ Done |
| 3 | 3 separate Redis connection implementations (pubsub, query-cache, queue) — each parsed URLs independently, different retry logic, inconsistent TLS/Upstash support | Create shared `redis-connection.ts` factory: unified URL parsing (3 formats), 3x exponential backoff, TLS, event handlers | ✅ Done |
| 4 | No awareness of Neon pooled vs. unpooled connection strings — production could exhaust connection limits | Add `resolveConnectionString()` in `prisma.ts`: auto-detect `?pgbouncer=true`, route to `DATABASE_URL_UNPOOLED` for direct connections, warn in production if misconfigured | ✅ Done |
| 5 | WebSocket connection state entirely in-memory — horizontal scaling requires sticky sessions or breaks entirely | Documented limitation; deferred — move state to Redis when horizontal scaling is needed (see D4) | 📋 Deferred |
| 6 | BullMQ Redis URL parsing only supported `REDIS_URL` / `UPSTASH_REDIS_REST_URL` — `REDIS_HOST`/`REDIS_PORT` fallback lacked Upstash TLS | Partially addressed by redis-connection.ts factory; TLS support now centralized | ✅ Partial |

### AI Pipeline

| # | Issue | Improvement | Status |
|---|-------|-------------|--------|
| 7 | AI resolution scores stored raw with no decay — old scores carried same weight as fresh ones, misleading confidence | Implement exponential decay function (90-day half-life) in `confidence-decay.ts`, apply in worker + API route, show age in UI | ✅ Done |
| 8 | `lastVerifiedAt` only set by staleness check, not resolution score job — staleness and resolution were disconnected | `handleResolutionScoreJob` now updates `lastVerifiedAt` + applies decay; staleness check uses both fields | ✅ Done |
| 9 | `ThreadWithFullContext` type didn't include `lastVerifiedAt` or `updatedAt` — couldn't show confidence age in UI | Added both fields to raw SQL query and type | ✅ Done |
| 10 | Staleness detection didn't exist for batch processing — no cron-ready handler to find stale threads | Implemented `handleStalenessCheckJob` with cursor-paginated batch mode (100 threads/page) | ✅ Done |

### UI & Components

| # | Issue | Improvement | Status |
|---|-------|-------------|--------|
| 11 | 1000+ messages all rendered in DOM — severe performance degradation on long threads | Virtual scrolling with `@tanstack/react-virtual`: only visible + 5 overscan items in DOM | ✅ Done |
| 12 | Mention autocomplete embedded inline in `post-message-form.tsx` — no avatar display, hard to identify users | Extracted `MentionSuggest` component with avatars, keyboard nav (arrows/Enter/Escape), 120ms debounce, portal rendering | ✅ Done |
| 13 | `TagChip` component (`components/thread/tag-chip.tsx`) existed but was never imported anywhere — completely unused | Wired into `ThreadInfoCard`, replaced bare `<span>` tags with colored chips linking to `/dashboard/tags/{slug}` | ✅ Done |
| 14 | No admin UI for tag CRUD — tags existed in DB with actions but required raw DB writes to create/edit/delete/merge | Full admin page at `/dashboard/admin/tags` with create, edit, delete, merge, search | ✅ Done |
| 15 | `CommentNode` imported in `comment-tree.tsx` but never used — dead code | Remove unused import (P4) | ✅ Done |
| 16 | Dashboard thread page uses separate layout from community threads — no RightPanel, so it lacks tags, related threads, confidence indicator | Add RightPanel components to dashboard thread aside (P3) | ✅ Done |
| 17 | `TagChip` links to `/dashboard/tags/{slug}` but this page doesn't exist — broken link | Create tag detail page (P2) | ✅ Done |
| 18 | `getRelatedThreads` returned thread slugs without community context — generated broken links like `/{slug}` instead of `/{community}/{slug}` | Added community `{ slug, name }` to query select, updated links | ✅ Done |

### Testing

| # | Issue | Improvement | Status |
|---|-------|-------------|--------|
| 19 | 260+ unit tests but zero browser/E2E tests — critical flows (auth, AI search, WebSocket) untested at integration level | Playwright v1.60 installed, 3 test files scaffolded (`auth-create-thread-reply`, `ai-search`, `websocket`), docker-compose.e2e.yml for local env | ✅ Scaffolded |
| 20 | Only 2 components had tests (ErrorBoundary, OtpInput, 10 tests) — core components like CommentTree and ThreadLiveWrapper untested | 18 new tests for CommentTree rendering, collapse state, depth limiting, buildMessageTree, countDescendants, ThreadLiveWrapper rendering | ✅ Done |
| 21 | No HTTP-level integration tests — route handler logic (auth enforcement, validation, business flows) only tested indirectly | Write integration tests with mocked `Request`/`prisma`/`requireSession` (P1) | ✅ Done |

### Environment & Tooling

| # | Issue | Improvement | Status |
|---|-------|-------------|--------|
| 22 | Playwright not installed — couldn't run browser tests | Installed `@playwright/test` v1.60 with Chromium | ✅ Done |
| 23 | Docker daemon running but current user (`pulkit`) lacks permissions — not in docker group, no sudo access | Documented limitation; E2E tests need Docker for Postgres + Redis | ⚠️ Unresolved |
| 24 | Redis not installed locally — no development Redis instance | docker-compose.e2e.yml provides Redis + Postgres for E2E; local dev relies on external REDIS_URL | ⚠️ Unresolved |
| 25 | `.env.test` doesn't include Redis vars — unit tests skip Redis, but E2E needs `REDIS_HOST`/`REDIS_PORT` | Documented in E2E setup instructions | ✅ Documented |

### Code Quality

| # | Issue | Improvement | Status |
|---|-------|-------------|--------|
| 26 | Empty `catch` blocks in some API routes — errors silently swallowed | Addressed in pre-2026-05-27 session | ✅ Done |
| 27 | Post-commit hooks auto-modify files (formatting/lint) — can cause git amend confusion | Documented in CLAUDE.md; no action needed | 📋 Documented |
| 28 | 6 independent `useState` calls in `ThreadLiveWrapper` — tempting to consolidate but they manage genuinely separate concerns | Deferred — consolidation would add complexity with no clear benefit | ⏸️ Deferred |

---

### 1. Standalone Worker Process
Extracted BullMQ workers from `instrumentation.ts` into dedicated `worker/index.ts` with graceful shutdown (SIGTERM/SIGINT handlers), docker-compose worker service (depends on Redis + Postgres), and `pnpm dev:worker`/`pnpm start:worker` scripts.

### 2. Error Response Standardization
Converted 15+ API route files from ad-hoc `{ error: '...' }` to structured `{ success, error: { code, message }, metadata }` using `ok()/fail()` helpers from `lib/utils/api-response.ts`. Standard error codes: AUTH_REQUIRED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, INTERNAL_ERROR.

### 3. Redis Connection Factory
Created `lib/infrastructure/redis-connection.ts` with `createRedisConnection()` — shared URL parsing (supports `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `REDIS_HOST`/`REDIS_PORT`), TLS for Upstash, 3x exponential backoff retry, event handlers (connect/error/close). All 3 consumers (pubsub, query-cache, queue) migrated to use the factory.

### 4. Database Connection Pooling
Added `resolveConnectionString()` to `lib/infrastructure/prisma.ts` — auto-selects pooled vs. unpooled URL based on `?pgbouncer=true` flag. Uses `DATABASE_URL_UNPOOLED` for PrismaNeon internal adapter when pooled URL detected. Logs warning in production if pooled URL lacks `pgbouncer=true`.

### 5. Staleness Detection (AI Job Handler)
Implemented `handleStalenessCheckJob` with two modes: single-thread (checks one thread by ID) and batch/cron (cursor-paginated scan, 100 threads at a time via `updatedAt` cursor). Staleness criteria: `updatedAt` > 30 days AND (`resolutionScore` IS NULL OR < 50). Batch mode uses `updateMany` for efficiency.

### 6. Virtual Scrolling for Long Threads
Rewrote `components/thread/message-list.tsx` using `@tanstack/react-virtual` — only renders visible messages + 5 overscan items regardless of total count (500+ message threads no longer bloat DOM). Exposed `scrollContainerRef` via ThreadContext for scroll-to-bottom and scroll position restoration on re-render.

### 7. Mention Autocomplete UI
Extracted inline mention search from `post-message-form.tsx` into `components/chat/mention-suggest.tsx` (`MentionSuggest` component). Features: debounced search (120ms), keyboard navigation (arrow keys, Enter to select, Escape to dismiss), user avatar + display name, portal rendering to avoid z-index/clipping issues.

### 8. Confidence Decay
Implemented exponential decay function in `lib/utils/confidence-decay.ts` (90-day half-life). Applied in two places: AI worker (`handleResolutionScoreJob` updates `lastVerifiedAt` and applies decay to stored score), and API route (`GET /api/ai/resolution-score` returns decayed score). UI indicator in `ThreadInfoCard` shows "Confidence: X% — based on data from Y ago" with age-relative text.

### 9. Thread Relations UI
Built `RelatedThreadsCard` server component in `components/panels/RelatedThreadsCard.tsx` — displays 3-5 related threads with similarity score badges and links. Wired into `RightPanel.tsx`. Updated `getRelatedThreads` repository query to include community `{ slug, name }` for correct `/community/thread` links.

### 10. Admin Tag Management UI (CRUD)
Full CRUD page at `app/(protected)/dashboard/admin/tags/page.tsx` with `TagManager` component (`components/admin/tag-manager.tsx`). Features: list all tags with color preview, inline create (name + color + optional description), edit name/color/description, delete with confirmation, merge one tag into another (reassigns all relations). Backed by `modules/tags/repository.ts` (listAllTags, updateTag, deleteTag, mergeTags) and `modules/tags/actions.ts` (4 new admin actions).

### 11. TagChip Wired into Thread View
Replaced simple `<span>` tag rendering in `ThreadInfoCard` with `TagChip` component. Updated thread SQL query to return `id`, `slug`, `color` fields alongside tag name. Color applied as background tint. TagChip links to `/dashboard/tags/${tag.slug}`.

### 12. Component Tests — CommentTree + ThreadLiveWrapper
18 tests across: `buildMessageTree` (7 cases — linear, nested, empty, single root, max depth), `countDescendants` (3 cases — root with children, deeply nested, single message), `isBeyondDepthLimit` (2 cases — depth limit boundary), collapse state persistence (3 cases — expand/collapse toggling, state survives re-render), CommentTree rendering (1 — renders message list), ThreadLiveWrapper rendering (2 — with and without pinned message banner). Next.js router context (AppRouterContext, SearchParamsContext, PathnameContext) mocked via internal providers for test isolation.

### 13. E2E Tests Scaffolded
Playwright v1.60 installed, `playwright.config.ts` with webServer config (auto-starts Next.js on port 3000), 3 test files in `e2e/`:
- `auth-create-thread-reply.spec.ts` — sign in via OTP, navigate to section, create thread, post reply
- `ai-search.spec.ts` — AI search dialog interaction + API endpoint calls
- `websocket.spec.ts` — WebSocket connection lifecycle + thread socket join/leave/message events

**To run:** needs PostgreSQL + Redis running (see docker-compose.e2e.yml), then `pnpm test:e2e`.

---

## 📋 Pending

### P1. Integration Tests (API Route Handlers)
26 tests across 10 route files, covering auth enforcement (401), input validation (400), and membership checks (403):
- `test/api/search.route.test.ts` (5 tests)
- `test/api/messages.route.test.ts` (3 tests)
- `test/api/conversations.route.test.ts` (3 tests)
- `test/api/upload.route.test.ts` (1 test)
- `test/api/newsletter.generate.route.test.ts` (2 tests)
- `test/api/ai/forum-search.route.test.ts` (2 tests)
- `test/api/ai/thread-summary.route.test.ts` (2 tests)
- `test/api/ai/thread-dna.route.test.ts` (2 tests)
- `test/api/ai/resolution-score.route.test.ts` (2 tests)
- `test/api/ai/jobs.route.test.ts` (4 tests — GET + DELETE)

6 routes refactored from `requireSession()` (redirect-based) to `auth.api.getSession({ headers: request.headers })` (JSON-returning) for testability. Created shared test factory at `test/api/helpers.ts`.

**Depends on:** ✅ Done.

### P2. `/dashboard/tags/[slug]` Page
Created page at `app/(protected)/dashboard/tags/[slug]/page.tsx` showing:
- Tag name, color, thread count
- All threads tagged with this tag (via `TopicGrid`)
- Empty state when no threads

Added `getTagBySlug()` and `getThreadsByTag()` to `modules/tags/repository.ts`.

**Depends on:** ✅ Done.

### P3. Dashboard Thread Page Parity
Dashboard thread aside now includes all `RightPanel` components:
- `ThreadInfoCard` — message count, participant count, resolution score with confidence aging, tags via TagChip
- `ThreadDnaCard` — thread DNA (question type, expertise, topics)
- `RelatedThreadsCard` — similar threads with similarity scores
- `ParticipantsCard` — participant avatars

Kept existing `ThreadSummaryCard`, stale warning, created date, and admin controls.

**Depends on:** ✅ Done.

### P4. Dead Code Removal
Removed unused `import { CommentNode }` from `components/thread/comment-tree.tsx` line 12.

**Depends on:** ✅ Done.

### P5. E2E Tests (Run & CI Integration)
The 3 E2E test files are scaffolded but haven't been run. Needs:
- Running PostgreSQL + Redis (via docker-compose.e2e.yml)
- Database migration + seed
- Next.js server running
- Possibly GitHub Actions service containers for CI

**Depends on:** Docker environment with Postgres + Redis.

---

## ⏸️ Deferred

### D1. ThreadLiveWrapper State Optimization
Deferred — the 6 `useState` calls in `ThreadLiveWrapper` manage genuinely independent concerns (messages, pinned message, participants, connection status, error state, unread count). Consolidation would add complexity without clear benefit.

### D2. Expert Passport
Expert profile feature: reputation scoring, expertise tagging (linked to `ThreadTag`), anonymous expert posting mode.

### D3. Cross-Thread Knowledge Graph
Visual graph view of `ThreadRelation` connections between threads. Thread merging UI for admins.

### D4. WebSocket Connection State in Redis
Move WebSocket connection state from in-memory to Redis to enable true horizontal scaling (no sticky sessions). Documented limitation per `shared/ARCHITECTURE.md`.

### D5. Performance/Load Tests
WebSocket connection load testing (e.g., artillery, k6), AI pipeline benchmark (prompt latency, token usage), query profiling (slow queries in Prisma).

### D6. Documentation
`API.md` endpoint reference, scaling limitations doc, architecture decision records (ADRs).

---

## ✅ Completed (Pre-2026-05-27)

All items from the original Engineering Review (2026-05-17) and prior rounds:

- Security fixes (IDOR, role bypass, regex complexity, blob UUID, system user atomicity)
- N+1 query batching, empty catch blocks, missing `select` optimization
- DRY: pagination helper, moderation/reports executors, server action response envelope, file size constants, motion variants
- Dead code removal (notifications, audit, follows — 13 functions removed)
- Accessibility (aria-labels, keyboard navigation, focus-visible, role attributes)
- Error boundaries (CommentTree, ThreadLiveWrapper, AISearch, app root)
- ThreadContext (eliminated 16-level prop drilling)
- Module index.ts consistency (audit, read-receipts, appeals, ws)
- Membership checks (search, thread-summary, threads listing, conversations)
- Email OTP validation (5 endpoints)
- Job ownership check (DELETE /api/ai/jobs)
- Action auth (edit history, section members)
- OAuth proxy URL (hardcoded localhost → env var)
- Type-safe attachment mapping (removed `as Record<string, unknown>` casts)
- Mock tests → real imports (5 test files)
- API route integration tests (25 tests)
- BullMQ job handler tests (11 tests, 8 handlers)
- Component tests (ErrorBoundary, OtpInput — 10 tests)
- Redis Upstash singleton + Lua script for atomic INCR+EXPIRE
- Rate limiter memoization
- Email template caching
