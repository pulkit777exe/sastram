# Sastram — Updated Development Plan

> **Note**: This plan has been updated following the engineering review (2026-05-27).
> Items marked ✅ are already implemented. Only remaining work is listed below.

---

## ✅ Already Implemented

These Phase 1–2 items from the original plan are now complete:

- **1.2 WebSocket wiring** — Redis pub/sub, typing indicators, notification count, reconnection
- **1.3 Dead code cleanup** — Unused functions removed, passthrough stubs converted to re-exports
- **1.4 DRY consolidation** — Moderation/reports executors unified, `computeHasMore()` centralized, file size constants unified, server action responses standardized (85+ actions)
- **2.1 Polls** — `poll-display.tsx` component, server actions, repository
- **2.2 Tags (backend + display)** — `tag-chip.tsx`, actions, repository (management UI deferred)
- **2.3 Thread Invitations** — Model, `invite-friend-button.tsx`, email integration
- **2.4 User Profiles** — Profile page, settings form tabs, Vercel Blob uploads
- **2.5 Notifications** — Page, interactive list, WebSocket live count, actions
- **2.6 Attachments** — Display components, upload via blob.ts
- **4.1 API Integration Tests** — 25 tests for auth enforcement, validation, rate limiting
- **5.2 Message Editing** — Actions, edit history viewer, inline edit mode
- **5.3 Message Pinning** — Actions, UI, WebSocket broadcast
- **5.4 Soft Delete** — `deletedAt` field, placeholder component, audit logging
- **5.5 Thread Relations (backend)** — `findRelatedThreads`, `updateAllThreadRelations` with batched queries

---

## Priority 1: Infrastructure Hardening (Eng Review Actions)

These come from the engineering review — they block clean development and production readiness.

### 1.1 Standalone Worker Process ✅
- Created `worker/index.ts` — standalone entry point, graceful SIGTERM/SIGINT shutdown
- Exported `stopAllWorkers` from `lib/queue/workers/index.ts`
- Removed worker startup from `instrumentation.ts` (kept Sentry)
- Added `pnpm dev:worker` (hot-reload) and `pnpm start:worker` scripts
- Added docker-compose `worker` service with health check dependencies

### 1.2 Error Response Standardization ✅
- All 31 API route files now use `ok()/fail()` helpers from `lib/utils/api-response.ts`
- Standardized format: `{ success, error: { code, message }, metadata }`
- Removed `withErrorHandling`, `successResponse`, `errorResponse` usage from search/messages routes
- Removed ad-hoc `errorResponse()` from forum-search route
- Consistent error codes: AUTH_REQUIRED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, INTERNAL_ERROR

### 1.3 Redis Connection Factory ✅
- Created `lib/infrastructure/redis-connection.ts` with centralized `createRedisConnection()`
- Based on best implementation (queue/connection.ts): URL parsing, TLS support, exponential backoff (3 retries)
- Supports per-consumer overrides for: retry strategy, maxRetriesPerRequest, lazyConnect, enableOfflineQueue
- Consumers updated: `redis-pubsub.ts`, `query-cache.ts`, `queue/connection.ts`

### 1.4 Database Connection Pooling ✅
- Added pooled connection string detection in `prisma.ts`: logs warning if `DATABASE_URL` lacks `pgbouncer=true` in production
- `resolveConnectionString()` automatically uses `DATABASE_URL_UNPOOLED` for the internal PrismaNeon adapter when a pooled URL is detected
- Prevent connection exhaustion by ensuring pooled URL goes through Neon's external pooler while direct connections use the unpooled URL

---

## Priority 2: AI Pipeline Completion

Backend work — the machine room of the AI features.

### 2.1 Staleness Detection (Queue Handler) ✅
- Implemented `handleStalenessCheckJob` — supports single-thread and batch/cron modes
- Staleness criteria: `updatedAt` > 30 days AND (`resolutionScore` IS NULL OR < 50)
- Batch mode: cursor-paginated scan of non-outdated threads, `updateMany` in batches of 100
- Updated tests: validation (throws on missing fields), DB-gated integration tests

### 2.2 Confidence Decay
- **Current state**: Does not exist
- **Goal**: Define decay function for resolution scores over time
- Old scores should carry less weight than recent ones
- Add UI indicator for confidence age (e.g., "Confidence: 85% — based on data from 3 months ago")

---

## Priority 3: Missing UIs & Polish

Work that touches both backend and frontend.

### 3.1 Mention Autocomplete
- **Current state**: Backend (`searchMentionUsers`) and parser exist, `post-message-form.tsx` has `mentionListRef` but no dedicated dropdown component
- Build `MentionSuggest` component with keyboard navigation (arrows, Enter, Escape), debounced search, user avatar display
- Wire into `post-message-form.tsx`

### 3.2 Thread Relations UI
- **Current state**: Backend fully built (`findRelatedThreads`, `updateAllThreadRelations`), no UI
- Build `RelatedThreadsPanel` component for thread sidebar
- Wire to existing `findRelatedThreads` API

### 3.3 Virtual Scrolling
- **Current state**: Threads with 1000+ messages cause DOM bloat
- **Goal**: Implement virtual scrolling for long threads
- Handle scroll position on re-render (flagged as critical gap — no error handling for scroll position corruption)

---

## Priority 4: Testing

### 4.1 E2E Tests
- **Current state**: 260+ unit tests, zero E2E tests
- Set up Playwright
- Cover 3 critical flows:
  1. Auth → create thread → reply
  2. AI search pipeline
  3. WebSocket real-time message delivery

### 4.2 Component Tests
- **Current state**: 2 components tested (ErrorBoundary, OtpInput)
- Add tests for `CommentTree` (recursive rendering, collapse/expand, depth limits)
- Add tests for `ThreadLiveWrapper` (WebSocket message handling, pinned message banner)

---

## Priority 5: New Features (Deferred)

These are valuable but not blocking. Work on them after P1–P4 is stable.

- **5.1 Expert Passport** — Expert profile with reputation, expertise tagging, anonymous expert mode
- **5.2 Cross-Thread Knowledge Graph** — `ThreadRelation` visual graph view, thread merging
- **5.3 Tag Management UI** — Admin page for create/edit/delete/merge tags, tag selector dialog
- **5.4 WebSocket Connection State in Redis** — Enables true horizontal scaling without sticky sessions (deferred per ARCHITECTURE.md)
- **5.5 Performance/Load Tests** — WebSocket load testing, AI pipeline benchmarks, query profiling
- **5.6 Documentation** — API.md endpoint reference, scaling limitations doc

---

## Architecture Decisions (from Eng Review)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Worker architecture | Standalone process | Isolation from HTTP server; independent scaling; crash containment |
| Error response format | `ok()/fail()` standardized | Consistent client-side error handling |
| WebSocket state | Keep in-memory | Documented limitation; sticky sessions sufficient for most deployments |
| Redis connections | Shared factory via `redis-connection.ts` | Single URL parsing + retry logic; eliminates config drift |
| DB pooling | Explicit pool config in `prisma.ts` | Prevents connection exhaustion with Neon serverless limits |
| Testing approach | Playwright for 3 critical flows | Balances coverage with maintenance cost |
