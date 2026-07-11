# Sastram Architecture

## Overview

Sastram is an AI-powered discussion and research platform. Users create threads in communities, post messages in a nested tree structure (depth up to 4), and AI assists with search, summarization, conflict detection, and inline responses. The system accumulates knowledge over time — threads gain resolution scores, DNA classification, and staleness tracking.

## Tech Stack

**Verified from `package.json`:**

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.9 |
| UI | React | 19.2.7 |
| Language | TypeScript | (strict mode) |
| ORM | Prisma | 7.8.0 |
| Database | PostgreSQL (Neon serverless) | via `@neondatabase/serverless` 1.1.0 |
| Auth | Better Auth | 1.6.19 |
| Cache/Queue | Upstash Redis | 1.38.0 |
| Job Queue | Upstash QStash | 2.11.1 |
| Rate Limiting | Upstash RateLimit | 2.0.8 |
| AI (primary) | Google Gemini | via `@google/genai | 0.24.1 |
| AI (alternative) | OpenAI | via LangChain |
| AI orchestration | LangChain | 1.5.0 |
| Email | Resend | 6.17.1 |
| File Storage | Vercel Blob | 2.4.0 |
| Styling | Tailwind CSS | via `@tailwindcss/postcss` 4.3.1 |
| Components | shadcn/ui (Radix primitives) | various |
| State (server) | TanStack React Query | 5.101.0 |
| State (client) | Zustand | (in `stores/`) |
| Monitoring | Sentry | 10.58.0 |
| Analytics | Vercel Analytics | 2.0.1 |
| Validation | Zod | 4.4.3 |
| Testing | Mocha + Chai | 11.7.6 / 6.2.2 |
| Runtime | Node.js 22 (Docker), pnpm 11.5.3 | |

## High-Level Architecture

```
Browser
│
├── HTTP / Server Actions ──→ Next.js App Router (app/)
│   │
│   ├── modules/ (30 domain modules)
│   │   ├── Prisma ──→ PostgreSQL (Neon)
│   │   ├── Upstash Redis (rate limit, cache, spend cap)
│   │   ├── QStash ──→ background jobs (webhook → app/api/jobs)
│   │   ├── Vercel Cron ──→ scheduled tasks (update-threads, cleanup-blobs)
│   │   ├── Vercel Blob (file uploads)
│   │   ├── Gemini / OpenAI (AI features)
│   │   └── Resend (transactional email)
│   │
│   └── API Routes (app/api/)
│
└── SSE ──→ AI reply streaming (app/api/threads/[threadId]/ai-reply/stream)
```

**CONFIRMED** — traced from actual imports and config wiring.

### Directory Map

```
sastram/
├── app/                    # Next.js App Router: pages + API routes
│   ├── (public)/           # Login, forgot-password, pricing, terms
│   ├── (protected)/        # Dashboard, threads, settings, admin
│   ├── api/                # REST endpoints (auth, threads, AI, cron, etc.)
│   ├── chat/               # Chat page
│   └── [community]/[thread]/  # Public community thread view
│
├── modules/                # 30 domain modules (business logic)
│   ├── auth/               # Session, OAuth, OTP
│   ├── threads/            # Thread CRUD, membership, slug routing
│   ├── messages/           # Post, edit, pin, delete, @mentions, @ai inline
│   ├── ai-search/          # Exa + Tavily + Gemini search pipeline
│   ├── moderation/         # Regex rules, AI content filtering
│   ├── chat/               # Real-time chat conversations
│   ├── notifications/      # In-app notifications
│   ├── newsletter/         # Email digest subscriptions
│   ├── ws/                 # WebSocket types + publisher (currently no-op)
│   └── ... (20 more)
│
├── lib/                    # Core infrastructure
│   ├── config/             # env.ts (Zod-validated), constants, permissions, routes
│   ├── infrastructure/     # prisma.ts, redis-*.ts, logger.ts, query-cache.ts
│   ├── services/           # ai.ts, auth.ts, email.ts, moderation.ts, rate-limit.ts, blob.ts
│   ├── queue/              # QStash config, types, workers (ai.worker, email.worker)
│   ├── schemas/            # Zod validation schemas
│   ├── utils/              # api-response, retry, slug, server-action, confidence-decay
│   └── middleware/         # moderation.ts (role checks)
│
├── components/             # UI components (shadcn/ui + feature components)
├── hooks/                  # React hooks (chat polling, debounce, AI reply stream)
├── stores/                 # Zustand stores (thread-view-store.ts)
├── prisma/                 # schema.prisma (33 models), migrations, seed.ts
├── test/                   # Mocha unit tests (23 test files)
└── shared/                 # ARCHITECTURE.md, context.md
```

## Data Model

**33 Prisma models** in `prisma/schema.prisma`. Database: PostgreSQL via Neon serverless.

### Core Entities

- **User** — email/password + OAuth, role (USER/MODERATOR/ADMIN), status (ACTIVE/SUSPENDED/BANNED), preferences as JSON, reputation points
- **Thread** — the central entity. Stores AI metadata directly: `resolutionScore`, `aiSummary`, `threadDna` (JSON), `isOutdated`, `lastVerifiedAt`. Visibility: PUBLIC/PRIVATE/RESTRICTED
- **Message** — nested tree via `parentId` + `depth` (0–4). `isAiResponse` for @ai messages. Soft-deleted via `deletedAt`. Denormalized `likeCount`/`replyCount`
- **ThreadMember** — membership with roles (OWNER/MODERATOR/MEMBER) and status (ACTIVE/INVITED/LEFT/REMOVED)
- **Community** — groups threads, visibility: PUBLIC/PRIVATE/UNLISTED

### Supporting Entities

- **Account/Session/Verification** — Better Auth tables
- **Reaction** — unique on (messageId, userId, emoji)
- **ReadReceipt** — tracks last-read message per user per thread
- **Notification** — typed (REPLY, MENTION, REACTION, INVITATION, SYSTEM, AI_INSIGHT)
- **Report/Appeal/UserBan** — moderation pipeline
- **ThreadInvitation** — email-based invitations with token
- **ThreadSubscription** — newsletter frequency (DAILY/WEEKLY/NEVER)
- **Poll/PollVote** — in-thread polls
- **UserFollow/UserBookmark** — social features
- **UserReputation/UserBadge/UserBadgeEarned** — gamification
- **UserActivity** — unified activity/audit log
- **ThreadTag/ThreadTagRelation** — tagging system
- **AiSearchSession/AiSearchResult** — AI search caching with TTL
- **ThreadRelation** — cross-thread semantic similarity (0.0–1.0)
- **MessageEdit/MessageMention/Attachment** — message metadata
- **ModerationRule** — regex-based moderation rules

### Key Relationships

```
User ──1:N──→ Thread (creator)
User ──1:N──→ Message (sender)
User ──M:N──→ Thread (via ThreadMember)
Thread ──1:N──→ Message
Message ──self──→ Message (parentId, tree structure)
Thread ──1:1──→ Poll
Thread ──M:N──→ ThreadTag (via ThreadTagRelation)
Thread ──1:N──→ ThreadSubscription
```

## Request/Data Flow

### 1. User Posts a Message

```
Client → POST /api/messages
  → modules/messages/actions/post.ts:postMessage
    → requireSession() — authenticate
    → check ThreadMember — authorize
    → content-safety.ts:sanitizeUserContent() — XSS filter
    → moderation pipeline (RateLimitFilter → RegexFilter → MLClassifier → ContextualAnalyzer)
    → prisma.message.create() + prisma.thread.update({ messageCount: increment })
    → enqueueJob('generate-ai-inline') if @ai mentioned
    → return { data, error, ok }
```

**CONFIRMED** — traced from `modules/messages/actions/post.ts` and `lib/services/moderation.ts`.

### 2. AI Search Pipeline

```
Client → POST /api/ai/forum-search
  → modules/ai-search/service.ts
    → Phase 1: Query classification (Gemini Flash)
    → Phase 2: Parallel search (Exa + Tavily via Promise.allSettled)
    → Phase 3: Cross-reference + tier assignment (T1=official, T2=SO/HN, T3=Reddit, T4=blogs)
    → Phase 4: Synthesis (Gemini Pro) → streamed ReadableStream
    → Phase 5: Cache result (pgvector, TTL by query type)
```

**CONFIRMED** — traced from `modules/ai-search/service.ts`.

### 3. Background Job Processing

```
API route enqueues → lib/services/queue.ts:enqueueJob()
  → QStash publishes to POST /api/jobs
    → app/api/jobs/route.ts (verifySignatureAppRouter)
      → lib/queue/workers/ai.worker.ts or email.worker.ts
        → Updates DB (Thread.aiSummary, Thread.resolutionScore, etc.)
        → Sends notifications via modules/notifications/

Vercel Cron → /api/cron/update-threads (daily 3 AM UTC)
           → /api/cron/cleanup-blobs (daily 4 AM UTC)
```

**CONFIRMED** — traced from `lib/services/queue.ts`, `app/api/jobs/route.ts`, `vercel.json`.

## Authentication & Authorization

### Authentication

**Library:** Better Auth 1.6.19 (`lib/services/auth.ts`)

- **Email + Password** with required email verification (OTP)
- **Email OTP** — sign-in, email verification, password reset, email change
- **OAuth** — Google and GitHub (optional, configured via env vars)
- **Session storage** — database-backed via Prisma adapter (Session model, token-based)
- **Client auth** — `lib/services/auth-client.ts` using `createAuthClient` with `emailOTPClient` plugin

**CONFIRMED** — read `lib/services/auth.ts` and `lib/services/auth-client.ts`.

### Authorization

- **Role-based**: USER, MODERATOR, ADMIN (Prisma enum)
- **Thread-level**: ThreadMember with OWNER/MODERATOR/MEMBER roles
- **Permission checks** in `lib/config/permissions.ts` — maps roles to allowed actions
- **Thread visibility**: PUBLIC (anyone), PRIVATE (members only), RESTRICTED
- **All API routes and server actions check membership** before allowing access

**CONFIRMED** — `lib/config/permissions.ts` defines permissions; CLAUDE.md documents the pattern.

## External Dependencies & Integrations

| Service | Purpose | Where Used |
|---------|---------|------------|
| **Neon** | PostgreSQL hosting | `lib/infrastructure/prisma.ts` |
| **Upstash Redis** | Rate limiting, QStash, spend caps, caching | `lib/infrastructure/redis-upstash.ts`, `lib/services/rate-limit.ts` |
| **Upstash QStash** | Background job queue | `lib/services/queue.ts`, `app/api/jobs/route.ts` |
| **Google Gemini** | AI: search, summaries, DNA, conflict detection, toxicity | `lib/services/ai.ts`, `modules/ai-search/service.ts` |
| **OpenAI** | Alternative AI provider | `lib/services/ai.ts` (OpenAIService class) |
| **LangChain** | Map-reduce thread summarization | `lib/services/ai-langchain.ts` |
| **Exa API** | Neural search (forum/technical content) | `modules/ai-search/service.ts` |
| **Tavily API** | General web + news search | `modules/ai-search/service.ts` |
| **Resend** | Transactional email (OTP, digests, notifications) | `lib/services/email.ts`, `lib/config/resend.ts` |
| **Vercel Blob** | File uploads (images, PDFs, videos) | `lib/services/blob.ts` |
| **Sentry** | Error monitoring | `sentry.client.config.ts`, `sentry.server.config.ts` |
| **Vercel Analytics** | Page view analytics | `app/layout.tsx` |

## Infrastructure & Deployment

### Production (Vercel)

- **Hosting**: Vercel serverless functions
- **Database**: Neon PostgreSQL (serverless, pgbouncer connection pooling)
- **Redis**: Upstash (HTTP REST API)
- **File Storage**: Vercel Blob
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) — typecheck, lint, build, test on push/PR
- **Cron**: Vercel Cron via `vercel.json` — daily thread updates and blob cleanup

### Local Development / Docker

- **Docker Compose** (`docker-compose.yml`): PostgreSQL 17, Redis 7, app, worker
- **Custom server**: `server.ts` — Node.js HTTP server wrapping Next.js (used in Docker CMD)
- **Dev mode**: `pnpm dev` — runs QStash dev server + Next.js dev concurrently

### CI Pipeline

Runs on every push and PR:
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm build` (with test DB env vars)
5. `pnpm test`

Uses PostgreSQL 16 and Redis 7 service containers.

**CONFIRMED** — read `.github/workflows/ci.yml`.

## Key Architectural Decisions & Trade-offs

1. **Serverless-first with no active WebSocket**: The `modules/ws/publisher.ts` exports no-op functions that only log. Real-time features use client-side polling instead. The Redis pub/sub infrastructure exists (`lib/infrastructure/redis-pubsub.ts`) but is not wired to active WS connections. This simplifies deployment but limits real-time capabilities.

2. **AI metadata stored directly on Thread model**: `resolutionScore`, `aiSummary`, `threadDna`, `isOutdated` are columns on the Thread table rather than separate tables. This avoids joins for reads but couples AI lifecycle to the Thread schema.

3. **Dual Redis clients**: Upstash Redis (HTTP REST, `lib/infrastructure/redis-upstash.ts`) for rate limiting and QStash; ioredis (native TCP, `lib/infrastructure/redis-connection.ts`) for pub/sub. Different protocols for different use cases.

4. **Email via Resend, not Nodemailer**: `nodemailer` appears only as a devDependency (`@types/nodemailer`). All email sending goes through Resend SDK (`lib/services/email.ts`). The shared docs incorrectly reference Nodemailer.

5. **Inline fallback for QStash jobs**: When QStash is not configured (local dev), jobs run inline via dynamic import (`lib/services/queue.ts:runJobInline`). This avoids requiring QStash for development.

6. **AI spend cap**: Global daily limit of 200 AI operations enforced via Redis atomic counter (`lib/services/ai-spend-cap.ts`). Fails open if Redis is unavailable.

7. **Confidence decay on resolution scores**: Scores decay over time via `lib/utils/confidence-decay.ts`, applied during resolution score calculation. Threads older than 30 days with low scores are marked outdated.

## Known Gaps, Tech Debt, and Contradictions

1. **No e2e tests**: The `e2e/` directory does not exist. No Playwright or Cypress in dependencies. The existing `shared/ARCHITECTURE.md` claims Playwright e2e tests — this is incorrect.

2. **WebSocket disabled**: All `emit*` functions in `modules/ws/publisher.ts` are no-ops (log only). The Redis pub/sub infrastructure exists but is not connected to active WS connections.

3. **`shared/ARCHITECTURE.md` inaccuracies**:
   - Claims "Nodemailer (SMTP)" — actual provider is Resend
   - Claims "256+ passing" tests — 23 test files exist
   - Claims "Playwright e2e tests" — no e2e directory or Playwright dependency
   - References `lib/infrastructure/bullmq.ts` — file does not exist
   - References `lib/templates/email-templates.ts` — directory does not exist
   - References `worker/index.ts` (docker-compose CMD) — file does not exist at root

4. **`nodemailer` as devDependency**: Only `@types/nodemailer` is listed (type definitions). No actual nodemailer runtime dependency. This is dead weight.

5. **Missing worker entry point**: `docker-compose.yml` references `worker/index.ts` in the worker service CMD, but this file does not exist in the repository root.

6. **Test coverage limited**: 23 test files covering utilities, services, and some components. No API route tests. No integration tests with real DB (CI uses a test DB but tests are unit-level).

## How to Verify This Document

| Claim | Verification |
|-------|-------------|
| Next.js 16.2.9 | `package.json` line 115: `"next": "^16.2.9"` |
| 33 Prisma models | `prisma/schema.prisma` — count model blocks |
| Better Auth 1.6.19 | `package.json` line 105: `"better-auth": "^1.6.19"` |
| Resend for email | `lib/services/email.ts` line 8: `import type { CreateEmailOptions } from 'resend'` |
| No e2e directory | `ls e2e/` returns "does not exist" |
| WS publisher is no-op | `modules/ws/publisher.ts` line 24: `logger.debug('[ws:noop] emitThreadMessage'` |
| QStash job queue | `lib/services/queue.ts` line 1: `import { Client } from '@upstash/qstash'` |
| 30 domain modules | `ls modules/` — 30 entries |
| CI pipeline | `.github/workflows/ci.yml` — typecheck, lint, build, test |
| AI spend cap 200/day | `lib/services/ai-spend-cap.ts` line 4: `const DAILY_LIMIT = 200` |

---

Last verified: 2026-07-10, against commit a6c8167
