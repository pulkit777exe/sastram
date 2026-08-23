# Sastram Architecture

Sastram is an AI-powered community forum where questions get **resolved**, not just answered. It combines traditional forum features with a live knowledge resolution engine — AI searches across the web, synthesizes results, detects conflicts, and assigns confidence scores. Human community validates and challenges AI output. Knowledge compounds over time.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Database | PostgreSQL via Prisma ORM (Neon serverless) |
| Auth | Better Auth (email OTP + Google + GitHub OAuth) |
| Queue | Upstash QStash (webhook to `/api/jobs`) |
| Cache / Rate Limit | Upstash Redis (REST) + ioredis (TCP pub/sub) |
| AI | Google Gemini (Flash + Pro), OpenAI GPT |
| AI Search | Exa API (neural), Tavily API (web) |
| File Storage | Vercel Blob |
| Email | Resend |
| Validation | Zod |
| State Management | Zustand (thread view) |
| Monitoring | Sentry, Vercel Analytics |
| Testing | Mocha + Chai (unit), Playwright (E2E) |

---

## System Architecture

```
Browser Client
│
├── HTTP / Server Actions → Next.js App Router (Vercel Serverless)
│   ├── modules/ (24 domain modules)
│   │   ├── Prisma → PostgreSQL (Neon)
│   │   ├── Upstash Redis (quotas, rate limits, spend cap, idempotency)
│   │   ├── QStash → background jobs (/api/jobs webhook)
│   │   ├── Vercel Cron → scheduled tasks (/api/cron/*)
│   │   ├── Vercel Blob (file storage)
│   │   ├── Gemini / Exa / Tavily (AI)
│   │   └── Resend (email)
│   └── API Routes (35 REST endpoints)
│
└── SSE → AI reply streaming (/api/threads/[threadId]/ai-reply/stream)
```

No custom server, no WebSocket layer. Real-time is SSE-only for AI streaming; all other updates use client polling.

---

## Directory Structure

```
sastram/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── layout.tsx                        # Root layout
│   ├── error.tsx                         # Root error boundary
│   ├── global-error.tsx                  # Global error boundary
│   ├── not-found.tsx                     # 404 page
│   ├── loading.tsx                       # Root loading state
│   ├── (public)/
│   │   ├── login/                        # Login page
│   │   ├── forgot-password/              # Forgot password (email → verify → reset)
│   │   ├── pricing/                      # Pricing page
│   │   └── terms/                        # Terms of service
│   ├── (protected)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx                  # Main dashboard
│   │   │   ├── threads/                  # Thread list + detail (by slug)
│   │   │   ├── messages/                 # Messages/inbox
│   │   │   ├── notifications/            # Notifications page
│   │   │   ├── bookmarks/                # Bookmarked threads
│   │   │   ├── search/                   # Local search
│   │   │   ├── sai-search/               # AI-powered search (brand: Sai)
│   │   │   ├── activity/                 # User activity feed
│   │   │   ├── tags/                     # Tags browser ([slug])
│   │   │   ├── settings/                 # Account settings + profile
│   │   │   └── admin/                    # Admin (tags, moderation, reports, appeals, health)
│   │   └── user/[userId]/                # Public user profile
│   ├── banned/                           # Banned user page
│   ├── invitations/                      # Invitation accept page
│   └── api/
│       ├── auth/[...all]/                # Better Auth catch-all
│       ├── health/                       # Public health check
│       ├── admin/
│       │   ├── health/                   # Admin detailed health
│       │   └── sla/                      # Moderation SLA stats
│       ├── bootstrap/                    # App init (user + notifications + activity)
│       ├── ai/
│       │   ├── forum-search/             # AI search pipeline (Exa+Tavily+Gemini)
│       │   ├── thread-summary/           # Thread summary generation
│       │   ├── thread-dna/               # Thread DNA analysis
│       │   ├── resolution-score/         # Resolution score calculation
│       │   ├── search-history/           # Search history retrieval
│       │   └── spend/                    # AI spend usage (admin)
│       ├── threads/
│       │   ├── route.ts                  # Thread CRUD
│       │   ├── similar/                  # Similar thread lookup
│       │   └── [threadId]/
│       │       └── ai-reply/
│       │           ├── route.ts          # AI reply trigger
│       │           └── stream/           # SSE streaming endpoint
│       ├── messages/                     # Message CRUD
│       ├── search/                       # Full-text search (threads, messages, users)
│       ├── upload/                       # File upload (Vercel Blob)
│       ├── sign-in/email-otp/            # Email OTP sign-in
│       ├── email-otp/
│       │   ├── send-verification-otp/    # Send OTP
│       │   ├── check-verification-otp/   # Check OTP
│       │   └── reset-otp/               # Reset OTP
│       ├── forget-password/email-otp/    # Password reset flow
│       ├── invitations/accept/           # Accept thread invitation
│       ├── newsletter/generate/          # Newsletter generation
│       ├── jobs/                         # QStash webhook (background jobs)
│       ├── csp-report/                   # CSP violation collector
│       └── cron/
│           ├── update-threads/           # Daily AI metadata refresh
│           ├── daily-digest/             # Email digest trigger
│           └── cleanup-blobs/            # Blob cleanup
│
├── modules/                              # Domain logic (24 modules)
│   ├── auth/                             # Session management, OAuth
│   ├── users/                            # User CRUD, profiles, avatar/banner upload
│   ├── threads/                          # Thread CRUD, slug routing, relations, confidence decay
│   ├── messages/                         # Post, edit, pin, delete, mentions, AI inline
│   ├── ai-search/                        # Exa + Tavily + Gemini pipeline, caching, query warming
│   ├── moderation/                       # Regex rules, content filtering, AI inline moderation
│   ├── reports/                          # Report creation, resolution
│   ├── appeals/                          # Ban appeal submission and review
│   ├── notifications/                    # In-app notifications, bulk creation
│   ├── newsletter/                       # Email digest subscriptions, processing
│   ├── follows/                          # User follow/unfollow
│   ├── bookmarks/                        # Thread bookmarking
│   ├── reactions/                        # Emoji reactions on messages
│   ├── read-receipts/                    # Thread read tracking
│   ├── tags/                             # Tag CRUD, thread-tag associations
│   ├── topics/                           # Topic creation (thread categories)
│   ├── members/                          # Thread membership management
│   ├── polls/                            # Poll creation, voting, results
│   ├── invitations/                      # Thread invitations
│   ├── activity/                         # User activity logging
│   ├── feedback/                         # In-app feedback widget submissions
│   ├── search/                           # Local full-text search
│   ├── policy/                           # Policy enforcement
│   └── audit/                            # Audit logging
│
├── lib/
│   ├── config/
│   │   ├── env.ts                        # Zod-validated environment variables
│   │   ├── constants.ts                  # File limits, magic numbers
│   │   ├── permissions.ts                # Role-based access control
│   │   ├── routes.ts                     # Route constants
│   │   └── resend.ts                     # Resend email client
│   ├── infrastructure/
│   │   ├── prisma.ts                     # Prisma Client (Neon adapter, global singleton)
│   │   ├── logger.ts                     # Structured logging with scrub()
│   │   ├── redis.ts                      # ioredis TCP connection (pub/sub, caching)
│   │   └── redis-upstash.ts              # Upstash REST Redis (quotas, rate limits)
│   ├── ai/
│   │   ├── factory.ts                    # AI provider factory
│   │   ├── gemini.ts                     # Gemini provider
│   │   ├── openai.ts                     # OpenAI provider
│   │   ├── noop.ts                       # NoOp provider (no API key)
│   │   ├── types.ts                      # AI types
│   │   ├── prompts.ts                    # Prompt templates
│   │   ├── prompt-boundary.ts            # Prompt injection defense delimiters
│   │   ├── helpers.ts                    # AI helpers
│   │   └── index.ts                      # Barrel exports
│   ├── queue/
│   │   ├── config.ts                     # AIJobType enum (8 job types)
│   │   ├── types.ts                      # Job data interfaces
│   │   └── workers/
│   │       ├── ai.worker.ts              # AI job handlers
│   │       └── email.worker.ts           # Email job handler
│   ├── schemas/
│   │   ├── api.ts                        # API request/response schemas
│   │   ├── thread-dna.ts                 # ThreadDNA Zod schema
│   │   └── user-preferences.ts           # User preference schema
│   ├── services/
│   │   ├── ai.ts                         # GeminiService + OpenAIService
│   │   ├── ai-langchain.ts               # LangChain map-reduce summarization
│   │   ├── ai-spend-cap.ts               # Dollar-based daily AI spend limit
│   │   ├── ai-usage-logger.ts            # Per-request token/cost logging
│   │   ├── ai-cost-classification.ts     # Request cost tiering (CHEAP/EXPENSIVE)
│   │   ├── ai-sentinel.ts                # AI-not-configured guard
│   │   ├── daily-quota.ts                # Per-user/day Redis quotas
│   │   ├── auth.ts                       # Better Auth configuration
│   │   ├── auth-client.ts                # Client-side auth helpers
│   │   ├── email.ts                      # Resend email sending
│   │   ├── moderation.ts                 # Content moderation pipeline
│   │   ├── image-moderation.ts           # Shared image NSFW moderation
│   │   ├── moderation-sla.ts             # Stale report escalation
│   │   ├── content-safety.ts             # HTML sanitization, file validation
│   │   ├── rate-limit.ts                 # Redis rate limiting + in-memory fallback
│   │   ├── queue.ts                      # QStash job enqueueing
│   │   ├── job-dedup.ts                  # Job deduplication
│   │   ├── idempotency.ts                # Idempotency keys
│   │   ├── counter-reconciliation.ts     # Denormalized counter repair
│   │   ├── soft-delete-purge.ts          # Purges soft-deleted users after 30 days
│   │   └── usage-check.ts                # Usage limit checks
│   ├── middleware/
│   │   ├── moderation.ts                 # requireModerator(), requireAdmin()
│   │   ├── cron-auth.ts                  # Cron Bearer token verification
│   │   └── ai-preflight.ts              # Shared AI route preflight (auth + rate limit + quota + spend cap + cost gate + thread access)
│   ├── actions/
│   │   └── result.ts                     # ActionEnvelope, ActionErrorCode
│   ├── types/
│   │   └── index.ts                      # Shared client-side types
│   ├── utils/
│   │   ├── server-action.ts              # createServerAction, withValidation
│   │   ├── api-response.ts               # ok(), fail() API response helpers
│   │   ├── errors.ts                     # AppError, handleError
│   │   ├── slug.ts                       # Generic slugify()
│   │   ├── file-upload.ts                # Upload helpers
│   │   ├── password-validation.ts        # Password rules
│   │   ├── retry.ts                      # withRetry() exponential backoff
│   │   ├── cn.ts                         # Tailwind class merging
│   │   ├── toast.ts                      # Client-side toast notifications
│   │   ├── client-logger.ts              # Client-side logging
│   │   ├── api-interceptor.ts            # Client API interceptor
│   │   └── validation-common.ts          # Shared Zod fragments (pagination)
│   ├── db/
│   │   └── pagination.ts                 # Cursor-based pagination
│   └── thread-access.ts                  # Thread authorization primitive
│
├── prisma/
│   ├── schema.prisma                     # 30 models
│   └── seed.ts                           # Database seed script
│
├── test/                                 # 46 Mocha test files (297+ passing)
│   └── e2e/                              # Playwright end-to-end tests
│
├── components/                           # React components
│   ├── ai-search/                        # SearchBox, Sidebar, SynthesisCard, etc.
│   ├── thread/                           # comment-tree, message-list, poll-*, etc.
│   ├── chat/                             # post-message-form, mention-suggest
│   ├── dashboard/                        # sidebar, settings-form, stats-card, etc.
│   ├── panels/                           # ThreadInfoCard, ThreadDnaCard, etc.
│   ├── notifications/                    # notification-list
│   ├── landing/                          # LandingPage
│   ├── layout/                           # Layout components
│   ├── auth/                             # LoginForm, ForgotPasswordModal
│   ├── admin/                            # Admin components
│   ├── appeals/                          # Appeal components
│   ├── user/                             # follow-button, profile-header, etc.
│   └── ui/                               # shadcn/ui + TimeAgo, ErrorBoundary, etc.
│
├── hooks/
│   ├── useAIReplyStream.ts               # SSE consumer for @sai streaming
│   ├── use-debounce.ts                   # Generic debounce hook
│   └── chat/use-message-composer.ts      # Message composition, drafts, mentions
│
└── stores/                               # Zustand state stores
```

---

## Data Model

30 Prisma models in `prisma/schema.prisma`.

### Core Content

| Model | Purpose | Key Fields |
|-------|---------|------------|
| User | User accounts | `role` (USER/MODERATOR/ADMIN), `status` (ACTIVE/SUSPENDED/BANNED), `profilePrivacy`, `preferences` (JSON), `deletedAt` |
| Thread | Discussion threads | `visibility` (PUBLIC/PRIVATE/RESTRICTED), `resolutionScore`, `threadDna` (JSON), `aiSummary`, `isOutdated`, `deletedAt` |
| Message | Thread messages | `parentId` (tree), `depth` (0-4), `isAiResponse`, `isEdited`, `isPinned`, `likeCount`, `replyCount`, nullable `senderId`, `deletedAt` |
| MessageEdit | Edit history | Content snapshot per edit |
| MessageMention | @mentions | `messageId`, `userId` |
| Attachment | File attachments | Typed (IMAGE/GIF/VIDEO/FILE) via `AttachmentType` enum |
| Reaction | Emoji reactions | Unique on `[messageId, userId, emoji]` |

### Access Control

| Model | Purpose |
|-------|---------|
| Account | Better Auth provider accounts (OAuth, password) |
| Session | Better Auth sessions (token-based) |
| Verification | Better Auth OTP verification codes |
| UserBan | Thread-scoped or site-wide bans with optional expiry |
| UserFollow | Social graph (self-referential) |
| ThreadInvitation | Token-based invites with expiry and status |

### Engagement

| Model | Purpose |
|-------|---------|
| Poll / PollVote | Thread polls with voting |
| UserBookmark | Saved threads |
| ReadReceipt | Per-thread read tracking |
| ThreadSubscription | Email digest frequency (DAILY/WEEKLY/MONTHLY/NEVER) |
| ThreadTag / ThreadTagRelation | Tagging system |
| Notification | Typed notifications (REPLY/MENTION/INVITATION/SYSTEM/AI_INSIGHT) with JSON `data` payload |
| UserActivity | Activity audit trail (type, entityType, entityId, metadata) |

### Moderation

| Model | Purpose |
|-------|---------|
| ModerationRule | DB-driven regex content rules |
| Report | Content reports with typed categories (SPAM/HARASSMENT/MISINFORMATION/ADULT_CONTENT/OTHER) |
| Appeal | Appeal pipeline (submitter → moderator review) |

### AI / Analytics

| Model | Purpose |
|-------|---------|
| AiSearchSession | AI search history with query classification, timing metadata, threading (parent/child) |
| AiSearchResult | Cached synthesis per query hash (TTL-based expiry) |
| AiUsageLog | Per-request token counts and cost estimates |
| ThreadRelation | Semantic similarity between threads (0.0–1.0 cosine) |
| Feedback | User feedback (BUG/SUGGESTION/OTHER) |

---

## Module Architecture

24 domain modules under `modules/`. Each follows a consistent pattern:

```
modules/{feature}/
├── actions.ts      — Server Actions (called from UI).
│                     Always returns: { data, error, ok, errorCode }
│                     Never throws. Always wraps in try/catch.
├── repository.ts   — DB queries via Prisma. Typed returns, never `any`.
├── service.ts      — Business logic, AI calls, orchestration (optional)
├── types.ts        — Module-specific types (optional)
├── schemas.ts      — Zod validation schemas (present in most)
├── index.ts        — Public exports (optional)
└── ...             — Module-specific files
```

### Module Categories

| Category | Modules |
|----------|---------|
| Auth & Identity | `auth/`, `users/` |
| Content | `threads/`, `messages/` |
| Social | `follows/`, `bookmarks/`, `notifications/`, `invitations/` |
| Engagement | `polls/`, `tags/`, `activity/`, `reactions/`, `read-receipts/` |
| Moderation | `moderation/`, `reports/`, `appeals/` |
| AI | `ai-search/` |
| Automation | `newsletter/`, `search/`, `feedback/`, `policy/`, `audit/`, `topics/`, `members/` |

---

## Authorization Model

**Thread access is the primary authorization primitive.** There is no membership table; access is derived from thread `visibility`, `createdBy`, and accepted `ThreadInvitation` rows.

| Guard | Purpose |
|-------|---------|
| `requireSession()` / `auth.api.getSession()` | Authentication only (does NOT check access) |
| `requireThreadAccessOrThrow(threadId, userId, role)` | Thread read access |
| `requireThreadWriteOrThrow(threadId, userId, role)` | Thread write access |
| `canAccessThread(thread, userId, role)` | Boolean check (no throw) |
| `canManageThread(thread, userId, role)` | Boolean check (creator/admin) |
| `visibilityFilter(userId, role)` | Prisma where clause for visible threads |
| `assertAdmin(user)` / `requireAdmin()` / `requireModerator()` | Role-based guards |

**Visibility rule (private/restricted threads):** creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN. Public threads are readable by anyone; writes still require a session.

```typescript
// Correct pattern (every action/route):
const session = await requireSession();
await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
```

---

## API Routes (35 endpoints)

### Authentication (6)
- `/api/auth/[...all]` — Better Auth catch-all
- `/api/sign-in/email-otp` — Email OTP sign-in
- `/api/email-otp/send-verification-otp` — Send OTP
- `/api/email-otp/check-verification-otp` — Check OTP
- `/api/email-otp/reset-otp` — Reset OTP
- `/api/forget-password/email-otp` — Password reset flow

### AI Features (6)
- `/api/ai/forum-search` — Full AI search pipeline (Exa + Tavily + Gemini)
- `/api/ai/thread-summary` — Generate AI thread summary
- `/api/ai/thread-dna` — Generate thread DNA analysis
- `/api/ai/resolution-score` — Calculate resolution score
- `/api/ai/search-history` — Get search history
- `/api/ai/spend` — Get AI spend usage (admin)

### Core Resources (6)
- `/api/threads` — Thread CRUD
- `/api/threads/similar` — Similar thread lookup
- `/api/threads/[threadId]/ai-reply` — AI reply trigger
- `/api/threads/[threadId]/ai-reply/stream` — SSE streaming endpoint
- `/api/messages` — Message CRUD
- `/api/search` — Local full-text search

### File & Invitations (2)
- `/api/upload` — File upload (Vercel Blob)
- `/api/invitations/accept` — Accept thread invitation

### Cron / Scheduled (3)
- `/api/cron/update-threads` — Batch AI metadata refresh
- `/api/cron/daily-digest` — Email digest trigger
- `/api/cron/cleanup-blobs` — Blob cleanup

### Admin / Moderation (7)
- `/api/admin/health` — Admin health check
- `/api/admin/sla` — Moderation SLA stats
- `/api/v1/moderation/queue` — Moderation queue
- `/api/v1/moderation/rules` — Moderation rules
- `/api/v1/moderation/stats` — Moderation stats
- `/api/v1/moderation/appeals/submit` — Submit appeal
- `/api/v1/moderation/appeals/review/[id]` — Review appeal

### Other (5)
- `/api/health` — Public health check
- `/api/bootstrap` — App init (user + notifications + activity)
- `/api/newsletter/generate` — Newsletter generation
- `/api/jobs` — QStash webhook (background jobs)
- `/api/csp-report` — CSP violation collector

---

## AI Architecture

### AI Service (`lib/ai/`)

Provider-agnostic factory pattern with Gemini, OpenAI, and NoOp providers:

| Method | Purpose | Provider |
|--------|---------|----------|
| `generateSummary()` | Quick content summary | Gemini Flash |
| `generateThreadSummary()` | Thread-level summary (LangChain map-reduce) | Gemini Flash |
| `generateThreadDNA()` | Metadata analysis (questionType, expertiseLevel, topics) | Gemini Flash |
| `calculateResolutionScore()` | 0–100 confidence score | Gemini Flash |
| `detectConflicts()` | Contradiction detection | Gemini Flash |
| `generateDailyDigest()` | HTML email digest | Gemini Pro |
| `generateStreamingResponse()` | Real-time token streaming | Gemini Flash / OpenAI |

**Robustness patterns:**
- `withRetry(fn, 3, 300)` — Exponential backoff on all external calls
- `AbortController` with 15s timeout (streaming uses 30s stall-based timeout)
- Zod validation on all AI outputs with fallback defaults
- Content capped at 12,000 characters to control token usage
- `cleanJsonText()` strips markdown fences before JSON parsing

### AI Preflight Middleware (`lib/middleware/ai-preflight.ts`)

Shared preflight for all AI routes — runs 6 checks in sequence:
1. Authentication (`requireSessionOrThrow`)
2. IP rate limiting (`rateLimit`)
3. Per-user daily quota (`consumeAiAnalysisQuota` or `consumeAiSearchQuota`)
4. Global spend cap (`enforceAiSpendCap`)
5. Cost gate (`evaluateAiCostGate`)
6. Thread access (optional, via `requireThreadAccessOrThrow`)

### AI Search Pipeline (`modules/ai-search/service.ts`)

5-phase pipeline:

```
User query → POST /api/ai/forum-search
│
├─ Phase 1: Classify (Gemini Flash)
│  → type: factual | opinion | technical | comparison
│  → suggestedSources, searchTerms[3], isControversial
│
├─ Phase 2: Parallel Search (Promise.allSettled)
│  → Exa: neural search for forum/technical content
│  → Tavily: general web + news
│
├─ Phase 3: Cross-reference + Conflict Detection (Gemini Flash)
│  → Tier assignment (T1=official docs, T2=SO/HN, T3=Reddit, T4=blogs)
│  → Freshness check (isOutdated if >2 years)
│  → Conflict detection prompt
│
├─ Phase 4: Synthesis (Gemini Pro)
│  → Max 400 words, cite tier inline [official] [community]
│  → Confidence score (0-100)
│
└─ Phase 5: Cache (Redis with TTL)
   → technical=6h, opinion=1h, news=15min
```

### @sai Inline Response Flow

```
User posts "@sai How do I fix X?"
│
├─ Message saved to DB
├─ Side effects adapter detects @sai mention
├─ QStash job enqueued (generate-ai-inline)
│
├─ Worker picks up job:
│  1. Find or reuse existing AI message for parent (retry safety)
│  2. Create empty placeholder message in DB
│  3. Stream AI response, flushing to DB every 500ms
│  4. On failure: write placeholder error message, return 200 (no QStash retry)
│
└─ Client receives streaming tokens → renders incrementally
```

---

## Background Jobs

### QStash Jobs (via `lib/queue/config.ts`)

| Job Type | Trigger | Handler | Stores Result In |
|----------|---------|---------|-----------------|
| `generate-thread-summary` | 50+ messages or manual | `handleThreadSummaryJob` | `Thread.aiSummary` |
| `generate-thread-dna` | 3rd message posted | `handleThreadDnaJob` | `Thread.threadDna` |
| `calculate-resolution-score` | 5+ messages or daily cron | `handleResolutionScoreJob` | `Thread.resolutionScore` |
| `detect-conflicts` | New message arrives | `handleConflictDetectionJob` | `Thread.isOutdated` + Notification |
| `generate-daily-digest` | Daily cron | `handleDailyDigestJob` | Email via Resend |
| `send-ai-insight-notifications` | Score change / conflict | `handleAIInsightNotificationsJob` | Notification table |
| `generate-ai-inline` | @sai mention (fallback path) | `handleAIInlineJob` | Message (streamed via SSE) |
| `staleness-check` | Daily cron | `handleStalenessCheckJob` | `Thread.isOutdated` flag |

**Common patterns in workers:**
- `assertSpendCapAvailable()` called before every AI generation
- `runAiGeneration()` wrapper catches quota/rate-limit errors and returns `{ ok: false, skipped: true }` instead of throwing (prevents QStash retry amplification)
- All job payloads validated at boundary (untrusted JSON from QStash)

### Vercel Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/update-threads` | Daily | Batch AI metadata refresh (DNA, score, conflicts, digest), update thread relations, prewarm follow-up queries, purge soft-deleted rows, reconcile counters |
| `/api/cron/daily-digest` | Daily | Process subscriptions by frequency, generate AI summaries, send via Resend |
| `/api/cron/cleanup-blobs` | Daily | Find attachments from soft-deleted messages, delete Vercel Blob, delete DB records |

**Security:** All cron endpoints use `verifyCronAuth()` with timing-safe Bearer token comparison (`crypto.timingSafeEqual`).

---

## Real-time Architecture

This is a serverless, forum-style platform. There are no persistent WebSocket connections.

- **AI reply streaming**: GET endpoint at `/api/threads/[threadId]/ai-reply/stream` uses Server-Sent Events. Events: `token`, `done`, `error`.
- **Message updates**: Clients poll for new messages (20s normal, 3s during @sai pending).
- **Redis Pub/Sub** (`lib/infrastructure/redis.ts`): `publishUserEvent` emits `NOTIFICATION_COUNT_UPDATE` on `user:{id}`. Publish-only; no subscriber exists.

---

## Security

### Authentication
- Better Auth with email OTP + OAuth (Google, GitHub)
- Session cookie: `better-auth.session_token`
- CRON_SECRET: Bearer token with min 32 characters

### Input Validation
- Zod validation at every boundary (env, API, actions, AI)
- Content sanitization via `sanitize-html` (XSS prevention)
- Prompt injection protection via `sanitizeSearchQuery()` and `prompt-boundary.ts`
- File upload: size limits (4.5MB), type whitelist, thread access check

### Rate Limiting
- Upstash Redis with sliding window
- In-memory fallback when Redis unavailable
- Buckets: auth(5/15min), api(100/min), upload(10/hr), message(20/min)

### Security Headers (`proxy.ts`)
- `Content-Security-Policy` — per-request nonce-based (Report-Only by default)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (HSTS)
- `Permissions-Policy` (no camera/mic/geo)

### Error Handling
- `AppError` with `code`, `statusCode`, user-facing `message`
- `handleError()` sanitizes unexpected errors (never leaks DB strings to client)
- `prismaErrorMessage()` converts Prisma codes to user-friendly messages
- `scrub()` in logger masks emails, bearer tokens, secrets

---

## Redis Usage

Two Redis clients serve different purposes:

| Client | Transport | Used For |
|--------|-----------|----------|
| Upstash REST (`lib/infrastructure/redis-upstash.ts`) | HTTP | Quotas, rate limits, idempotency, job dedup, spend cap |
| ioredis TCP (`lib/infrastructure/redis.ts`) | TCP | Pub/sub, caching |

**Lua scripts** (atomic operations):
- `ATOMIC_INCR_EXPIRE_LUA`: INCR + EXPIRE in one round trip
- `CHECK_AND_INCR_EXPIRE_LUA`: Check limit before increment (quotas)
- `CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA`: Float variant for dollar spend cap

**TTL strategy:** All daily quotas/spend caps use `getSecondsUntilUtcMidnight()` for TTL, resetting on UTC day boundary rather than 24h after first use.

---

## Testing

### Unit Tests (46 files, 297+ passing)

| Area | Files |
|------|-------|
| AI | `ai-cost-classification`, `ai-inline-client-stream`, `ai-inline-counter-increment`, `ai-not-configured`, `ai-search-quota`, `ai-toxicity-classification` |
| Moderation | `moderation-regex`, `content-safety` |
| Rate Limiting | `rate-limit`, `redis-upstash` |
| API | `api-response`, `api-routes` |
| Actions | `actions`, `bookmarks.action` |
| Search | `search-fts`, `similarity-check-quota` |
| Components | `components`, `thread-components` |
| Utilities | `utils`, `errors`, `slug`, `logger` |
| Other | `draft-autosave`, `email-template`, `pagination-integration` |

**Patterns:** Sinon stubs for Prisma/Redis/AI, `resetRateLimiters()` for isolation, `sinon.stub(process, 'env')` for env mocking.

### E2E Tests (Playwright)
- `auth-create-thread-reply.spec.ts` — Auth + thread creation + reply
- `ai-search.spec.ts` — AI search flow

### CI (GitHub Actions)
PostgreSQL 16 service container → `pnpm install` → `prisma migrate` → `tsc --noEmit` → `eslint` → `mocha tests`

---

## Deployment

- **Host:** Vercel (serverless)
- **Database:** Neon PostgreSQL (serverless, connection pooling via `pgbouncer=true`)
- **Redis:** Upstash (serverless)
- **Storage:** Vercel Blob
- **CI/CD:** GitHub Actions → auto-deploy on main

### Commands

```bash
pnpm dev            # Next.js dev server
pnpm build          # Prisma generate + Next build
pnpm start          # Production server
pnpm test           # Mocha unit tests (297+ passing)
pnpm test:e2e       # Playwright e2e tests
pnpm typecheck      # TypeScript check
pnpm lint           # ESLint
pnpm lint:fix       # ESLint fix
pnpm format         # Prettier
pnpm db:generate    # Prisma generate
pnpm db:push        # Prisma db push
pnpm db:migrate     # Prisma migrate dev
pnpm db:studio      # Prisma studio
```

---

## Environment Variables

### Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (Neon) |
| `BETTER_AUTH_SECRET` | Auth secret (32+ chars) |
| `BETTER_AUTH_URL` | Auth base URL |
| `NEXT_PUBLIC_APP_URL` | Public URL |
| `CRON_SECRET` | Bearer token for cron endpoints |
| `QSTASH_TOKEN` | Upstash QStash token |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash signing key |
| `QSTASH_NEXT_SIGNING_KEY` | QStash next signing key |
| `GEMINI_API_KEY` or `OPENAI_API_KEY` | AI provider |

### Optional

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Redis for caching/queues |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash REST Redis |
| `AI_PROVIDER` | "gemini" (default) or "openai" |
| `RATE_LIMIT_ENABLED` | Set to "false" to disable |
| `CONTENT_MODERATION_ENABLED` | Enable AI moderation |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `SENTRY_DSN` | Sentry error tracking |
| `SASTRAM_EXA_KEY` / `SASTRAM_TAVILY_KEY` / `SASTRAM_GEMINI_KEY` | AI search keys (client-side) |
