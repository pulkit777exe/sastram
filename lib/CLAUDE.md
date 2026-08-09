# Lib Directory

## Overview

Core utilities, services, and infrastructure code. The backbone of the application.

## Subdirectories

### Top-level
- `thread-access.ts` - Thread authorization primitive (`requireThreadAccessOrThrow`, `canAccessThread`, `canManageThread`)
- `sanitize.ts` - HTML/content sanitization

### `lib/config/`
Environment variables, permissions, routes, constants.
- `env.ts` - Zod-validated environment variables
- `permissions.ts` - Role-based access control
- `routes.ts` - API route definitions
- `constants.ts` - Shared constants
- `resend.ts` - Resend email client

### `lib/services/`
Business logic services.
- `ai.ts` - Gemini/OpenAI integration
- `ai-langchain.ts` - LangChain wrappers
- `ai-spend-cap.ts` - Dollar-based daily AI spend limit
- `ai-usage-logger.ts` - Per-request token/cost logging
- `ai-cost-classification.ts` - Request cost tiering
- `ai-sentinel.ts` - AI-not-configured guard
- `daily-quota.ts` - Per-user/day Redis quotas (AI inline, analysis, search, image moderation)
- `auth.ts` - Better Auth configuration
- `auth-client.ts` - Client-side auth
- `email.ts` - SMTP email sending
- `moderation.ts` - Content moderation (regex + AI)
- `moderation-sla.ts` - Stale report escalation
- `content-safety.ts` - Profanity filtering
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
- `query-cache.ts` - Query result caching
- `redis.ts` - ioredis connection factory + pub/sub publisher
- `redis-upstash.ts` - Upstash REST Redis (quotas, rate limits)

### `lib/utils/`
Utility functions.
- `server-action.ts` - `createServerAction` wrapper
- `api-response.ts` - API response helpers
- `errors.ts` - Error types
- `slug.ts` - Slug generation
- `cron-auth.ts` - Cron Bearer token verification
- `mention-parser.ts` - @mention parsing
- `prompt-boundary.ts` - Prompt injection boundaries
- `render-content.tsx` - Content rendering
- `file-upload.ts` - Upload helpers
- `password-validation.ts` - Password rules
- `confidence-decay.ts` - Score decay over time
- `retry.ts` - Retry with backoff
- `escape.ts` - String escaping
- `cn.ts` - Tailwind class merging
- `toast.ts` - User-facing toast notifications
- `client-logger.ts` / `api-interceptor.ts` - Client-side logging
- `validation-common.ts` - Shared Zod fragments

### `lib/actions/`
- `result.ts` - `ActionEnvelope` (`{ ok, data, error, errorCode }`) and helpers

### `lib/schemas/`
Zod validation schemas.
- `database.ts` - Prisma model schemas
- `api.ts` - API request/response schemas
- `thread-dna.ts` - Thread DNA output schema
- `user-preferences.ts` - User preference schema

### `lib/queue/`
- `config.ts` / `types.ts` - Job definitions
- `workers/ai.worker.ts`, `workers/email.worker.ts` - Job handlers

### `lib/middleware/`
- `moderation.ts` - Request content moderation

### `lib/db/`
- `pagination.ts` - Cursor-based pagination

## Testing Notes

Services have Mocha unit tests covering moderation, schemas, content safety, rate limiting, and AI quotas.