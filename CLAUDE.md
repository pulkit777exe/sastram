# Sastram — Discussion and Research Platform

Personal project, open sourced. Built with Next.js, Prisma, and AI.

## Overview

Next.js 16+ Discussion and Research Platform with TypeScript, Prisma ORM, PostgreSQL (Neon), serverless architecture, Better Auth authentication, and AI integration.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL via Neon serverless
- **ORM**: Prisma 7+
- **Auth**: Better Auth
- **AI**: Google Gemini / OpenAI GPT
- **Styling**: Tailwind CSS + shadcn/ui components

## Commands

```bash
# Development
pnpm dev              # Next.js dev server

# Build & Deploy
pnpm build           # Prisma generate + Next build
pnpm start           # Production server

# Testing & Linting
pnpm test            # Mocha tests (199 passing)
pnpm typecheck      # TypeScript check
pnpm lint          # ESLint
pnpm lint:fix      # ESLint fix
pnpm format        # Prettier

# Database
pnpm db:generate   # Prisma generate
pnpm db:push      # Prisma db push
pnpm db:migrate   # Prisma migrate dev
pnpm db:studio   # Prisma studio
```

## Architecture

### Directory Structure

- `app/` - Next.js App Router pages and API routes
- `lib/` - Core utilities, services, infrastructure
- `modules/` - Domain modules (25 feature modules)
- `components/` - UI components
- `prisma/` - Database schema
- `test/` - Mocha unit tests
- `stores/` - Zustand stores

### Database Models

29 models in `prisma/schema.prisma`:
- User (deletedAt), Account, Session, Verification
- Thread (deletedAt, visibility, memberCount)
- Message (deletedAt, nullable senderId), MessageEdit, MessageMention, Attachment
- Reaction, ReadReceipt
- UserFollow, UserBookmark
- Notification
- ThreadSubscription
- ModerationRule (CHECK constraints), Appeal (own table), Report (escalatedAt, firstResponseAt), UserBan
- ThreadTag, ThreadTagRelation
- Poll, PollVote
- UserReputation, UserBadge, UserBadgeEarned
- UserActivity (CHECK constraint)
- ThreadInvitation
- AiSearchSession, AiSearchResult
- AiUsageLog (costUsd)
- ThreadRelation

### Key Services

- **AI** (`lib/services/ai.ts`): GeminiService, OpenAIService with summaries, thread DNA, resolution scores, image NSFW moderation
- **Auth** (`lib/services/auth.ts`): Better Auth with email OTP
- **Rate Limit** (`lib/services/rate-limit.ts`): Redis-based rate limiting with in-memory fallback
- **Moderation** (`lib/services/moderation.ts`): Regex-based content filtering + AI inline + moderator notifications
- **AI Spend Cap** (`lib/services/ai-spend-cap.ts`): Dollar-based daily limit ($5.00) via Redis INCRBYFLOAT
- **AI Usage Logger** (`lib/services/ai-usage-logger.ts`): Per-request token counts and cost estimates
- **Image Moderation Quota** (`lib/services/image-moderation-quota.ts`): Per-user 50/day limit
- **Moderation SLA** (`lib/services/moderation-sla.ts`): Stale report escalation (>24h/72h)
- **Soft-Delete Purge** (`lib/services/soft-delete-purge.ts`): Purges soft-deleted users after 30 days

### Background Jobs

- QStash webhook callback at `app/api/jobs/route.ts`
- Job handlers in `lib/queue/workers/ai.worker.ts` and `email.worker.ts`
- Vercel Cron for scheduled tasks (update-threads, cleanup-blobs)
- Jobs: thread summary, thread DNA, resolution score, conflict detection, daily digest, AI inline, email, staleness check, AI insight notifications
- Jobs retry 3x via QStash

### API Routes

- `/api/auth/*` - Authentication endpoints
- `/api/threads/*` - Thread operations
- `/api/messages/*` - Message operations
- `/api/ai/*` - AI-powered features (forum-search, thread-summary, thread-dna, resolution-score, jobs)
- `/api/cron/*` - Scheduled jobs (cron auth via `CRON_SECRET` Bearer token)
- `/api/v1/moderation/*` - Moderation tools (admin-only)
- `/api/conversations` - Chat conversations (membership-scoped)

## Authorization Patterns

**All API routes and server actions must enforce thread access checks.**

- **Thread access model** is the primary authorization primitive — see `lib/thread-access.ts` (`requireThreadAccessOrThrow`, `requireThreadWriteOrThrow`, `canAccessThread`, `canManageThread`). There is no membership table; access is derived from thread `visibility`, `createdBy`, and accepted `ThreadInvitation` rows.
- **Visibility rule (private/restricted threads):** creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN. Public threads are readable by anyone; writes still require a session.
- Routes/actions that read/write thread data must call `requireThreadAccessOrThrow(threadId, userId, role)` / `requireThreadWriteOrThrow(...)`.
- `requireSession()` / `auth.api.getSession()` for authentication only — does NOT check access.
- Admin-only: `assertAdmin(session.user)` in thread actions, `requireAdmin()` / `requireModerator()` for API routes.
- Chat (messages + websocket): posting and reading require thread access (modules/messages/actions.ts, modules/ws/).
- AI routes (`thread-dna`, `resolution-score`, `ai-reply`) require thread access.
- Message posting requires thread access.

## Test Coverage

- **Current**: 40 test files covering utilities, services, API routes, and some components
- **Missing**: e2e tests, integration tests with real DB, component storybook

## Architecture Notes

- Server actions use `createServerAction` from `lib/utils/server-action.ts`
- Auth handled manually inside action handlers via `requireSession()`
- `Result<T, E>` type and `safeAction` wrapper removed — use `{ data, error, errorCode, ok }` return objects

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection (Neon)
- `REDIS_URL` - Redis for caching/queues (optional; rate limiting also uses `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` and degrades gracefully without it)
- `BETTER_AUTH_SECRET` - Auth secret (32+ chars)
- `BETTER_AUTH_URL` - Auth base URL
- `NEXT_PUBLIC_APP_URL` - Public URL
- `CRON_SECRET` - Bearer token for cron endpoints (min 32 chars)
- `QSTASH_TOKEN` - Upstash QStash token for background jobs
- `QSTASH_CURRENT_SIGNING_KEY` - QStash signing key for request verification
- `QSTASH_NEXT_SIGNING_KEY` - QStash next signing key for key rotation
- `GEMINI_API_KEY` or `OPENAI_API_KEY` - AI provider
- `RATE_LIMIT_ENABLED` - Set to `false` to disable rate limiting

Optional:
- `GITHUB_CLIENT_ID/SECRET` - GitHub OAuth
- `GOOGLE_CLIENT_ID/SECRET` - Google OAuth
- `SMTP_*` - Email configuration

## CI

GitHub Actions workflow in `.github/workflows/ci.yml` — runs typecheck, lint, and tests with a PostgreSQL service container.