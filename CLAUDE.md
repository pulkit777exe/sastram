# Sastram - Forum Application

## Overview

Next.js 14+ forum application with TypeScript, Prisma ORM, PostgreSQL (Neon), WebSocket real-time chat, Better Auth authentication, and AI integration.

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
pnpm dev:server       # Custom server
pnpm dev:worker      # Background worker

# Build & Deploy
pnpm build           # Prisma generate + Next build
pnpm start           # Production server

# Testing & Linting
pnpm test            # Mocha tests (30 passing)
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

28 models in `prisma/schema.prisma`:
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
- ThreadRelation, UserExpertise

### Key Services

- **AI** (`lib/services/ai.ts`): GeminiService, OpenAIService with summaries, thread DNA, resolution scores
- **Auth** (`lib/services/auth.ts`): Better Auth with email OTP
- **Rate Limit** (`lib/services/rate-limit.ts`): Redis-based rate limiting
- **Moderation** (`lib/services/moderation.ts`): Regex-based content filtering

### WebSocket

- Server: `lib/infrastructure/websocket/server.ts`
- Client: `lib/infrastructure/websocket/client.ts`

### API Routes

- `/api/auth/*` - Authentication endpoints
- `/api/threads/*` - Thread operations
- `/api/messages/*` - Message operations
- `/api/ai/*` - AI-powered features
- `/api/cron/*` - Scheduled jobs
- `/api/v1/moderation/*` - Moderation tools

## Known Issues

### TypeScript Errors (need fixing)

1. `app/page.tsx:11` - 'user' type error on 'never'
2. `hooks/useMessages.ts:33` - Type conversion issue
3. `modules/newsletter/actions.ts:101,106` - Prisma relation type error

### Lint Errors

1. `app/(public)/pricing/page.tsx:48` - Unescaped entity `'` → use `&apos;` or `&#39;`

### Test Coverage

- **Current**: 30 tests in 3 files
- **Missing**: Integration tests, API endpoint tests, WebSocket tests
- **Dependencies needed**: Add @types/mocha

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis for rate limiting
- `BETTER_AUTH_SECRET` - Auth secret (32+ chars)
- `BETTER_AUTH_URL` - Auth base URL
- `NEXT_PUBLIC_APP_URL` - Public URL
- `GEMINI_API_KEY` or `OPENAI_API_KEY` - AI provider

Optional:
- `GITHUB_CLIENT_ID/SECRET` - GitHub OAuth
- `GOOGLE_CLIENT_ID/SECRET` - Google OAuth
- `SMTP_*` - Email configuration

## Recent Changes

- migrated to Next.js App Router
- integrated with Neon serverless
- added AI features (summaries, thread DNA, resolution scores)
- WebSocket real-time chat
- moderation system with appeals

## Notes

- Uses `zod` for schema validation
- Custom Result type in `lib/utils/result.ts`
- Server Actions in module files
- Prisma adapter: `@prisma/adapter-neon`
- WebSocket uses `ws` library