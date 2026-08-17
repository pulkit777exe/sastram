# Lib Directory

## Overview

Core utilities, services, and infrastructure code. The backbone of the application.

## Top-level Files

- `thread-access.ts` - Thread authorization primitive (`requireThreadAccessOrThrow`, `canAccessThread`, `canManageThread`)

## Subdirectories

### `lib/config/`
Environment variables, permissions, routes, constants.
- `env.ts` - Zod-validated environment variables
- `permissions.ts` - Role-based access control
- `routes.ts` - API route definitions
- `constants.ts` - Shared constants
- `resend.ts` - Resend email client

### `lib/services/`
Business logic services.
- `ai.ts` - Gemini/OpenAI integration (summaries, DNA, conflicts, toxicity)
- `ai-langchain.ts` - LangChain map-reduce summarization
- `ai-spend-cap.ts` - Dollar-based daily AI spend limit
- `ai-usage-logger.ts` - Per-request token/cost logging
- `ai-cost-classification.ts` - Request cost tiering
- `ai-sentinel.ts` - AI-not-configured guard
- `daily-quota.ts` - Per-user/day Redis quotas (AI inline, analysis, search, image moderation)
- `auth.ts` - Better Auth configuration
- `auth-client.ts` - Client-side auth
- `email.ts` - Resend email sending
- `moderation.ts` - Content moderation pipeline (RateLimitFilter, RegexFilter, MLClassifier, ContextualAnalyzer, MessageModerationPipeline)
- `image-moderation.ts` - Shared image NSFW moderation for upload routes (quota + spend cap + AI check)
- `moderation-sla.ts` - Stale report escalation
- `content-safety.ts` - Profanity filtering, file validation
- `rate-limit.ts` - Redis rate limiting with in-memory fallback
- `queue.ts` - QStash job enqueueing
- `job-dedup.ts` - Job deduplication
- `idempotency.ts` - Idempotency keys
- `counter-reconciliation.ts` - Denormalized counter repair
- `soft-delete-purge.ts` - Purges soft-deleted users after 30 days
- `usage-check.ts` - Usage limit checks

### `lib/infrastructure/`
Database, cache, logging.
- `prisma.ts` - Prisma Client (Neon adapter)
- `logger.ts` - Structured logging
- `redis.ts` - ioredis connection factory
- `redis-upstash.ts` - Upstash REST Redis (quotas, rate limits)

### `lib/ai/`
AI security and prompt utilities.
- `prompt-boundary.ts` - LLM prompt injection defense delimiters

### `lib/utils/`
Genuinely shared utility functions.
- `server-action.ts` - `createServerAction`, `withValidation` wrappers
- `api-response.ts` - `ok()`, `fail()` API response helpers
- `errors.ts` - Error types
- `slug.ts` - Generic `slugify()` function
- `file-upload.ts` - Upload helpers
- `password-validation.ts` - Password rules
- `retry.ts` - Retry with backoff
- `cn.ts` - Tailwind class merging (`cn()`)
- `toast.ts` - User-facing toast notifications
- `client-logger.ts` - Client-side logging
- `api-interceptor.ts` - Client API interceptor
- `validation-common.ts` - Shared Zod fragments (pagination)

### `lib/actions/`
- `result.ts` - `ActionEnvelope` (`{ ok, data, error, errorCode }`), `ActionErrorCode`, `actionSuccess`, `actionFailure`

### `lib/schemas/`
Zod validation schemas.
- `api.ts` - API request/response schemas
- `thread-dna.ts` - Thread DNA output schema
- `user-preferences.ts` - User preference schema

### `lib/queue/`
Background job definitions and handlers.
- `config.ts` - Job configuration
- `types.ts` - Job data interfaces
- `workers/ai.worker.ts` - AI job handlers (summary, DNA, score, conflicts, inline, staleness)
- `workers/email.worker.ts` - Email job handler

### `lib/middleware/`
- `moderation.ts` - `requireModerator()`, `requireAdmin()`
- `cron-auth.ts` - Cron Bearer token verification
- `ai-preflight.ts` - Shared AI route preflight (auth, rate limit, quota, spend cap, cost gate, thread access)

### `lib/db/`
- `pagination.ts` - Cursor-based pagination

### `lib/types/`
- `index.ts` - Shared client-side types (Message, Sender, Attachment, Poll, etc.)

## Removed Files
The following files no longer exist (removed during refactor):
- `lib/services/blob.ts` - Vercel Blob wrapper (removed)
- `lib/infrastructure/redis-connection.ts` - Consolidated into `redis.ts`
- `lib/infrastructure/redis-pubsub.ts` - Consolidated into `redis.ts`
- `lib/utils/dedupe.ts` - Consolidated into `job-dedup.ts`
- `lib/infrastructure/query-cache.ts` - Dead code (no consumers)
- `lib/utils/index.ts` - Unnecessary barrel export (consumers migrated to direct imports)
- `lib/sanitize.ts` - Moved to `modules/ai-search/sanitize.ts` (single consumer)
- `lib/utils/mention-parser.ts` - Moved to `modules/messages/mention-parser.ts` (domain logic)
- `lib/utils/confidence-decay.ts` - Moved to `modules/threads/confidence-decay.ts` (domain logic)
- `lib/utils/prompt-boundary.ts` - Moved to `lib/ai/prompt-boundary.ts` (AI security)
- `lib/utils/cron-auth.ts` - Moved to `lib/middleware/cron-auth.ts` (infrastructure)
- `lib/utils/render-content.tsx` - Moved to `components/thread/render-content.tsx` (UI component)
- `lib/utils/slug.ts` - `buildThreadSlug` moved to `modules/threads/slug.ts` (domain logic)

## Testing Notes

Services have Mocha unit tests covering moderation, schemas, content safety, rate limiting, and AI quotas.
