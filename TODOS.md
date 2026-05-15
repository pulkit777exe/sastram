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
