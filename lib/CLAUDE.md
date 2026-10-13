# Lib Directory

## Overview

Core utilities, services, and infrastructure code. The backbone of the application.

## Top-level Files

- `thread-access.ts` - Thread authorization primitive (`requireThreadAccessOrThrow`, `requireThreadWriteOrThrow`, `canAccessThread`, `canManageThread`, `visibilityFilter`)

## Subdirectories

### `lib/config/`
Environment variables, permissions, routes, constants.
- `env.ts` - Zod-validated environment variables (`serverEnvSchema` + `fullyClientSafeSchema`)
- `permissions.ts` - Role-based access control single seam (`canModerate`, `isAdmin`, `requireAdmin`, `requireModerator`, `assertAdminOrThrow`)
- `routes.ts` - API route definitions (`ROUTES.THREAD(slug)` → `/dashboard/threads/${slug}`)
- `constants.ts` - Shared constants (`FILE_LIMITS`)
- `resend.ts` - Resend email client

### `lib/services/`
Business logic services.
- `ai-langchain.ts` - LangChain map-reduce summarization
- `ai-spend-cap.ts` - Dollar-based daily AI spend limit ($5.00 via Redis `INCRBYFLOAT`, `enforceAiSpendCap` checks AND increments)
- `ai-usage-logger.ts` - Per-request token/cost logging (`AiUsageLog`)
- `ai-cost-classification.ts` - Request cost tiering (CHEAP/EXPENSIVE)
- `ai-sentinel.ts` - AI-not-configured guard
- `daily-quota.ts` - `consumeQuota(kind)` over the QUOTAS table (analysis, search, inline, image_moderation)
- `auth.ts` - Better Auth configuration
- `auth-client.ts` - Client-side auth
- `email.ts` - Resend email sending
- `moderation.ts` - Content moderation pipeline (RateLimitFilter, RegexFilter, MLClassifier, ContextualAnalyzer, MessageModerationPipeline)
- `image-moderation.ts` - Shared image NSFW moderation for upload routes (quota + spend cap + AI check)
- `moderation-sla.ts` - Stale report escalation (>24h/72h)
- `content-safety.ts` - HTML sanitization, file validation, SSRF `isSafePublicUrl`
- `rate-limit.ts` - Redis rate limiting with in-memory fallback (buckets: auth, api, upload, message)
- `queue.ts` - QStash job enqueueing (`CRITICAL_JOBS = email` → 3 retries, default 1)
- `job-dedup.ts` - Job deduplication
- `idempotency.ts` - Idempotency keys
- `counter-reconciliation.ts` - Denormalized counter repair (`likeCount`, `messageCount`)
- `soft-delete-purge.ts` - Purges soft-deleted users after 30 days
- `usage-check.ts` - Usage limit checks
- `user-memory.ts` - Weekly expertiseLevel inference (50 active users, `threadDna` + `AiSearchSession.queryType`)
- `knowledge-promotion.ts` - Auto-promotes verified high-score threads (`resolutionScore > 85` + `verifiedAt` → `KnowledgePage`)
- `reputation.ts` - Verified-thread reputation scoring (`verifiedThreadCount * 10`)

### `lib/infrastructure/`
Database, cache, logging.
- `prisma.ts` - Prisma Client (Neon adapter, global singleton)
- `logger.ts` - Structured logging with `scrub()` (masks emails, tokens, secrets)
- `redis-upstash.ts` - Upstash REST Redis (quotas, rate limits, idempotency, spend cap, job dedup). Only Redis client — there is no ioredis/TCP client and no `redis.ts`.

### `lib/ai/`
Provider-agnostic AI layer (there is no `lib/services/ai.ts`).
- `factory.ts` - AI provider factory (Gemini / OpenAI / NoOp)
- `gemini.ts` / `openai.ts` / `noop.ts` - Providers (summaries, DNA, resolution scores, conflicts, streaming, image NSFW)
- `prompts.ts` - Prompt templates
- `prompt-boundary.ts` - LLM prompt injection defense delimiters
- `helpers.ts` - AI helpers (`cleanJsonText`, `withRetry`, timeouts)
- `text.ts` - Raw-text seam (`createKeyedLlm`, Gemini→OpenAI failover)
- `guard.ts` - `checkAiGuards` / `runGuardedAi` / `checkCronSpendCaps` (quota→spend→gate, one order)
- `types.ts` - AI types

### `lib/utils/`
Genuinely shared utility functions.
- `server-action.ts` - `createServerAction`, `withValidation` wrappers (standard `{ data, error, ok, errorCode }` envelope)
- `api-response.ts` - `ok()`, `fail()` API response helpers + `withErrorHandling`
- `errors.ts` - Error types (`AppError`, `handleError`, `prismaErrorMessage`)
- `slug.ts` - Generic `slugify()` (thread slugs live in `modules/threads/slug.ts`)
- `file-upload.ts` - Upload helpers (UUID keys, MIME sniff)
- `password-validation.ts` - Password rules
- `retry.ts` - Retry with backoff (`withRetry`)
- `cn.ts` - Tailwind class merging (`cn()`)
- `toast.ts` - User-facing toast notifications
- `client-logger.ts` - Client-side logging
- `api-interceptor.ts` - Client API interceptor
- `validation-common.ts` - Shared Zod fragments (pagination, `computeHasMore`)
- `format.ts` - Shared formatting helpers (history labels, notification grouping)
- `request-ip.ts` - Shared IP extraction (`getRequestIp`) for rate-limit keys
- `sse.ts` - SSE single owner (`sseChunk` / `sseEvent` / `createSSEStream` / `parseSSE`)
- `view-transitions.ts` - `isViewTransitionsEnabled()` + `supportsViewTransitions()`

### `lib/actions/`
- `result.ts` - `ActionEnvelope` (`{ ok, data, error, errorCode }`), `ActionErrorCode`, `actionSuccess`, `actionFailure`

### `lib/schemas/`
Zod validation schemas.
- `api.ts` - API request/response schemas
- `thread-dna.ts` - Thread DNA output schema
- `user-preferences.ts` - User preference schema (expertiseLevel + moat toggles)

### `lib/queue/`
Background job definitions and handlers (9 job types in `config.ts`: `AIJobType`).
- `config.ts` - Job configuration (9 types)
- `types.ts` - Job data interfaces (discriminated union)
- `workers/ai-jobs.ts` - Coalesced AI job handlers
- `workers/thread-summary.worker.ts`, `thread-dna.worker.ts`, `resolution-score.worker.ts`, `conflict-detection.worker.ts`, `staleness-check.worker.ts`, `daily-digest.worker.ts`, `insight-notifications.worker.ts` - Split domain workers
- `workers/ai-inline.worker.ts` - Streaming @sai handler
- `workers/email.worker.ts` - Email job handler
- `workers/_shared.ts` - `runGuardedWorker` + `readAlreadyBilled` (spend+gate skip, warn-log)
- `workers/index.ts` - Registry / re-exports (`runJobInline` handles all 9)

### `lib/middleware/`
- `moderation.ts` - `requireModerator()`, `requireAdmin()`
- `cron-auth.ts` - Cron Bearer token verification (`verifyCronAuth`, timing-safe)
- `ai-guard-route.ts` - `guardAiRoute` (session→rate→guards→thread, SSE-aware)

### `lib/db/`
- `pagination.ts` - Cursor-based pagination (uses denormalized `thread.messageCount`, not `COUNT(*)`)

### `lib/attachments/`
- `service.ts` + `ports.ts` + `adapters/vercel-blob.ts` + `adapters/ai-moderation.ts` - Vercel Blob storage port/adapters

### `lib/types/`
- `index.ts` - Shared client-side types (Message, Sender, Attachment, Poll, etc.)

## Removed Files
The following files no longer exist (removed during refactor):
- `lib/services/blob.ts` - Vercel Blob wrapper (removed; see `lib/attachments/`)
- `lib/infrastructure/redis-connection.ts` + `redis-pubsub.ts` - Consolidated (only `redis-upstash.ts` remains; no TCP pub/sub)
- `lib/infrastructure/redis.ts` - Does not exist (Upstash REST only)
- `lib/services/ai.ts` - Does not exist (AI lives in `lib/ai/`)
- `lib/motion.ts` - Does not exist (framer-motion variants were inlined; no shared motion module)
- `lib/dedupe.ts` - Deleted (process-global cache) — replaced with React `cache()`; job dedup lives in `lib/services/job-dedup.ts`
- `lib/infrastructure/query-cache.ts` - Dead code (no consumers)
- `lib/utils/index.ts` - Unnecessary barrel export (consumers use direct imports)
- `lib/sanitize.ts` - Moved to `modules/ai-search/sanitize.ts` (single consumer)
- `lib/utils/mention-parser.ts` - Moved to `modules/messages/mention-parser.ts` (domain logic)
- `lib/utils/confidence-decay.ts` - Moved to `modules/threads/confidence-decay.ts` (domain logic)
- `lib/utils/prompt-boundary.ts` - Moved to `lib/ai/prompt-boundary.ts` (AI security)
- `lib/utils/cron-auth.ts` - Moved to `lib/middleware/cron-auth.ts` (infrastructure)
- `lib/utils/render-content.tsx` - Moved to `components/thread/render-content.tsx` (UI component)
- `lib/utils/slug.ts` - `buildThreadSlug` moved to `modules/threads/slug.ts` (domain logic)

## Testing Notes

Services have Mocha unit tests covering moderation, schemas, content safety, rate limiting, and AI quotas (65 files total in `test/`).
