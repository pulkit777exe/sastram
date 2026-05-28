# TODOS

> Last updated: 2026-05-27 (current session completed)

---

## ✅ Completed (2026-05-27 Session)

### 1. Standalone Worker Process
Extracted BullMQ workers from `instrumentation.ts` into dedicated `worker/index.ts` with graceful shutdown, docker-compose worker service, and `pnpm dev:worker`/`pnpm start:worker` scripts.

### 2. Error Response Standardization
Converted 15+ API route files from ad-hoc `{ error: '...' }` to structured `{ success, error: { code, message }, metadata }` using `ok()/fail()` helpers. Consistent error codes across all routes.

### 3. Redis Connection Factory
Created `lib/infrastructure/redis-connection.ts` with shared URL parsing, TLS, retry strategy (3x exponential backoff), and event handlers. All 3 consumers (pubsub, query-cache, queue) now use the factory.

### 4. Database Connection Pooling
Added `resolveConnectionString()` to prisma.ts — auto-selects pooled vs. unpooled URL based on `?pgbouncer=true` flag. Uses `DATABASE_URL_UNPOOLED` for PrismaNeon adapter.

### 5. Staleness Detection (AI Job Handler)
Implemented `handleStalenessCheckJob` with cursor-paginated batch scan (100 threads at a time) and single-thread mode. Criteria: `updatedAt` > 30 days AND resolution score < 50.

### 7. Component Tests — CommentTree + ThreadLiveWrapper
18 tests across: `buildMessageTree` (7), `countDescendants` (3), `isBeyondDepthLimit` (2), collapse state persistence (3), CommentTree rendering (1), ThreadLiveWrapper rendering (2).
Next.js router context mocked via internal context providers for test isolation.

---

## 📋 Pending

### 6. E2E Tests (Playwright)
Scaffolded: Playwright v1.60 installed, `playwright.config.ts` with webServer (auto-starts Next.js on port 3000), 3 test files in `e2e/`:
- `auth-create-thread-reply.spec.ts` — sign in via OTP, create thread, post reply
- `ai-search.spec.ts` — AI search dialog + API endpoints
- `websocket.spec.ts` — WebSocket connection + thread socket lifecycle

**To run locally:** `docker compose -f docker-compose.e2e.yml up -d` (PostgreSQL + Redis), then `pnpm db:setup`, then `pnpm test:e2e`
**CI integration:** Needs Redis service container in CI workflow.
**Depends on:** Running PostgreSQL + Redis + Next.js server.

### 8. Mention Autocomplete UI
Build `MentionSuggest` component with keyboard navigation (arrow keys, Enter/Escape), debounced search (300ms), user avatar + name display. Wire into `post-message-form.tsx` placeholder.
**Depends on:** None.

### 9. Confidence Decay
Implement decay function (half-life of 90 days) for resolution scores. Apply during score calculation or via periodic job. Add UI indicator showing confidence age.
**Depends on:** Staleness detection ✓ (completed above)

### 10. Thread Relations UI
Built `RelatedThreadsCard` server component in `components/panels/RelatedThreadsCard.tsx`. Displays 3-5 related threads with similarity score, topic badges (from threadDNA), and links. Wired into `RightPanel.tsx`. Updated `getRelatedThreads` to include community slug for proper thread links.
**Depends on:** None.

### 11. Virtual Scrolling for Long Threads
Implement virtual scrolling for threads with 1000+ messages using react-window or @tanstack/virtual. Preserve scroll position on re-render.
**Depends on:** None.

### 12. ThreadLiveWrapper State Optimization
⏸️ Deferred — 6 `useState` calls manage genuinely independent concerns.

---

## ✅ Completed (Post-Review, Pre-2026-05-27)

All items from the original Engineering Review (2026-05-17) and prior rounds are completed:

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
