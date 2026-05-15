# Sastram — Forum Application

Personal project, open sourced. Built with Next.js, Prisma, WebSockets, and AI.

## Overview

Next.js 16+ forum application with TypeScript, Prisma ORM, PostgreSQL (Neon), WebSocket real-time chat, Better Auth authentication, and AI integration.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL via Neon serverless
- **ORM**: Prisma 7+
- **Auth**: Better Auth
- **AI**: Google Gemini / OpenAI GPT
- **Real-time**: Custom WebSocket infrastructure
- **Styling**: Tailwind CSS + shadcn/ui components

## Commands

```bash
# Development
pnpm dev              # Next.js dev server
pnpm dev:server       # Custom server (runs WebSocket server)
pnpm dev:worker      # BullMQ worker process

# Build & Deploy
pnpm build           # Prisma generate + Next build
pnpm start           # Production server

# Testing & Linting
pnpm test            # Mocha tests (60 passing)
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
- `modules/` - Domain modules (50+ feature modules)
- `components/` - UI components
- `prisma/` - Database schema
- `test/` - Mocha unit tests
- `stores/` - Zustand stores

### Database Models

27 models in `prisma/schema.prisma`:
- User, Account, Session, Verification
- Community, Section, SectionMember
- Message, MessageEdit, MessageMention, Attachment
- Reaction, ReadReceipt
- UserFollow, UserBookmark
- Notification
- ThreadSubscription
- ModerationRule, Appeal, Report, UserBan
- ThreadTag, ThreadTagRelation
- Poll, PollVote
- UserReputation, UserBadge, UserBadgeEarned
- UserActivity
- ThreadInvitation
- AiSearchSession, AiSearchResult
- ThreadRelation

### Key Services

- **AI** (`lib/services/ai.ts`): GeminiService, OpenAIService with summaries, thread DNA, resolution scores
- **Auth** (`lib/services/auth.ts`): Better Auth with email OTP
- **Rate Limit** (`lib/services/rate-limit.ts`): Redis-based rate limiting with in-memory fallback
- **Moderation** (`lib/services/moderation.ts`): Regex-based content filtering + AI inline

### WebSocket

- Server: `lib/infrastructure/websocket/server.ts`
- Client: `lib/infrastructure/websocket/client.ts`
- State is **in-memory** — single server only (see `shared/ARCHITECTURE.md` for scaling limitations)

### BullMQ Job Queues

- `lib/infrastructure/bullmq.ts` — defines 9 queue names and job handlers
- Worker runs as separate process (`worker/index.ts`) via `pnpm dev:worker`
- Jobs: thread summary, thread DNA, resolution score, conflict detection, daily digest, AI inline, email, staleness check, AI insight notifications
- Jobs retry 3x with exponential backoff

### API Routes

- `/api/auth/*` - Authentication endpoints
- `/api/threads/*` - Thread operations
- `/api/messages/*` - Message operations
- `/api/ai/*` - AI-powered features (forum-search, thread-summary, thread-dna, resolution-score, jobs)
- `/api/cron/*` - Scheduled jobs (cron auth via `CRON_SECRET` Bearer token)
- `/api/v1/moderation/*` - Moderation tools (admin-only)
- `/api/conversations` - Chat conversations (membership-scoped)

## Authorization Patterns

**All API routes and server actions must enforce membership checks.**

- **SectionMember** is the primary authorization primitive — user must have a `SectionMember` record for the section
- Routes that read/write thread data: check `prisma.sectionMember.findUnique({ where: { sectionId_userId: { sectionId, userId } } })`
- `requireSession()` / `auth.api.getSession()` for authentication only — does NOT check membership
- Admin-only: `assertAdmin(session.user)` in thread actions, `requireAdmin()` / `requireModerator()` for API routes
- Chat: `getConversations` / `getMessages` / `sendMessage` all require membership (modules/chat/actions.ts)
- AI routes (`thread-dna`, `resolution-score`, `ai-reply`) require membership
- Message posting requires membership

## Test Coverage

- **Current**: 60 tests in 9 files (api-response, content-safety, error-handling, logger, queue-config, search-fts, simple, utils, websocket)
- **Missing**: API endpoint tests, BullMQ job tests

## Architecture Notes

- Server actions use `createServerAction` from `lib/utils/server-action.ts`
- Auth handled manually inside action handlers via `requireSession()`
- `Result<T, E>` type and `safeAction` wrapper removed — use `{ data, error, errorCode, ok }` return objects
- WebSocket state is in-memory (see `shared/ARCHITECTURE.md` for scaling limitations)
- BullMQ worker runs as a separate process, not in the Next.js server

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection (Neon)
- `REDIS_URL` - Redis for BullMQ and rate limiting
- `BETTER_AUTH_SECRET` - Auth secret (32+ chars)
- `BETTER_AUTH_URL` - Auth base URL
- `NEXT_PUBLIC_APP_URL` - Public URL
- `CRON_SECRET` - Bearer token for cron endpoints (min 32 chars)
- `GEMINI_API_KEY` or `OPENAI_API_KEY` - AI provider
- `RATE_LIMIT_ENABLED` - Set to `false` to disable rate limiting

Optional:
- `GITHUB_CLIENT_ID/SECRET` - GitHub OAuth
- `GOOGLE_CLIENT_ID/SECRET` - Google OAuth
- `SMTP_*` - Email configuration

## CI

GitHub Actions workflow in `.github/workflows/ci.yml` — runs typecheck, lint, and tests with a PostgreSQL service container.

## Known Issues

1. WebSocket state is in-memory — does not work across multiple server instances
2. BullMQ Redis URL parsing only supports `REDIS_URL` / `UPSTASH_REDIS_REST_URL` — standalone `REDIS_HOST`/`REDIS_PORT` fallback lacks TLS support for Upstash