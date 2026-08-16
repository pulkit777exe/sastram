# Sastram Architecture Documentation

> **Canonical reference.** This document is the verified, code-accurate system reference for Sastram.

## Overview

Sastram is an AI-powered community forum where questions get **resolved**,
not just answered. It combines traditional forum features with a live
knowledge resolution engine — AI searches across Reddit, HN, ArchWiki,
Stack Overflow and docs simultaneously, synthesizes results, detects
conflicts, and assigns confidence scores. Human community validates and
challenges AI output. Knowledge compounds over time.

## Project Purpose

Build the first forum platform where answers stay current, have confidence
scores, and AI + humans resolve questions together — not just collect
opinions about them.

**Core differentiator:** Unlike Reddit (entertainment), Stack Overflow
(point-in-time answers), or Perplexity (stateless search) — Sastram
accumulates knowledge. More users = better answers for the next user.

---

## Core Technology Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js App Router (API routes + Server Actions), Node.js
- **Database:** PostgreSQL via Prisma ORM (Neon serverless), 30 models
- **Real-time:** SSE streaming for AI replies; client polling for message updates
- **Background Jobs:** Upstash QStash + Vercel Cron
- **Authentication:** Better Auth (email OTP + Google + GitHub)
- **Cache / Rate Limit:** Upstash Redis
- **File Storage:** Vercel Blob Storage
- **Email:** Resend — `lib/services/email.ts`
- **AI — Search:** Exa API + Tavily API (via `modules/ai-search/service.ts`)
- **AI — Synthesis:** Google Gemini Flash (classify/DNA) + Pro (synthesis)
- **AI — LangChain:** Map-reduce summarization via `lib/ai/langchain.ts`
- **State Management:** Zustand (thread view)
- **E2E Testing:** Playwright (`test/e2e/`)

---

## System Architecture

```
Browser Client
│
├── HTTP / Server Actions → Next.js App Router
│   │
│   ├── modules/ (domain logic — 23 modules)
│   │   │
│   │   ├── Prisma → PostgreSQL (Neon)
│   │   ├── Upstash Redis (cache + rate limit)
│   │   ├── QStash → background jobs (thread summary, DNA, score, conflicts)
│   │   ├── Vercel Cron → scheduled tasks (daily digest, staleness check)
│   │   ├── Vercel Blob (file storage)
│   │   ├── Gemini / Exa / Tavily (AI)
│   │   └── Resend (email)
│   │
│   └── API Routes (REST endpoints)
│
└── SSE → AI reply streaming (app/api/threads/[threadId]/ai-reply/stream)
```

---

## Directory Structure

```
sastram/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── (public)/
│   │   ├── login/                        # Login page
│   │   ├── forgot-password/              # Forgot password (3 steps: email, verify, reset)
│   │   ├── pricing/                      # Pricing page
│   │   └── terms/                        # Terms of service
│   ├── (protected)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx                  # Main dashboard
│   │   │   ├── threads/                  # Thread list + detail
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
│   ├── api-docs/                         # API documentation page
│   └── api/
│       ├── auth/[...all]/                # Better Auth catch-all
│       ├── health/                       # Public health check
│       ├── admin/health/                 # Admin detailed health
│       ├── bootstrap/                    # Login round-trip (user + notifications + activity)
│       ├── ai/
│       │   ├── forum-search/             # AI search pipeline (Exa+Tavily+Gemini)
│       │   ├── thread-summary/           # Thread summary generation
│       │   ├── thread-dna/               # Thread DNA analysis
│       │   └── resolution-score/         # Resolution score calculation
│       ├── jobs/                         # QStash webhook callback (background AI/email jobs)
│       ├── threads/                      # Thread REST + [threadId]/ai-reply
│       ├── messages/                     # Message REST (POST)
│       ├── search/                       # Full-text search (threads, messages, users)
│       ├── upload/                       # File upload (Vercel Blob)
│       ├── sign-in/email-otp/            # Sign in with OTP
│       ├── email-otp/                    # Send, check, reset OTP
│       ├── forget-password/email-otp/    # Forget password flow
│       ├── newsletter/generate/          # Newsletter digest generation
│       ├── cron/
│       │   ├── update-threads/           # Daily AI metadata refresh
│       │   ├── daily-digest/             # Email digest trigger
│       │   └── jobs/                     # QStash webhook callback
│       └── v1/moderation/               # Moderation API (queue, stats, rules, appeals)
│
├── components/
│   ├── ai-search/                        # SearchBox, Sidebar, PhaseTracker, SynthesisCard, SourceCard, TableView, ApiKeysModal
│   ├── thread/                           # comment-tree, message-list, post-message-form, mention-suggest, poll-*, panels, subscribe-button, create-thread-dialog
│   ├── dashboard/                        # dashboard-shell, sidebar, dashboard-providers, topic-card, topic-grid
│   ├── account/                          # account-tab, account-danger-zone, sessions/connected/email/password cards
│   ├── settings/                         # settings-form, settings-tabs, preferences-form
│   ├── newsletter/                       # newsletter-management
│   ├── notifications/                    # notification-list
│   ├── landing/                          # LandingPage
│   ├── layout/                           # Layout components
│   ├── auth/                             # LoginForm, ForgotPasswordModal, OtpInput
│   ├── admin/                            # Admin components
│   ├── appeals/                          # Appeal components
│   ├── user/                             # follow-button, profile-header, user-stats
│   └── ui/                               # shadcn/ui + TimeAgo, ErrorBoundary, LoadingVideo, ThemeToggle
│
├── hooks/
│   ├── useAIReplyStream.ts               # SSE consumer for @sai reply streaming
│   └── use-message-composer.ts           # Message composition, drafts, mentions
│
├── modules/                              # Domain logic (23 modules)
│   ├── auth/                             # Session management, OAuth
│   ├── users/                            # User CRUD, profiles, avatar/banner upload
│   ├── threads/                          # Thread CRUD, slug routing, relations
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
│   ├── members/                          # Thread membership management
│   ├── polls/                            # Poll creation, voting, results
│   ├── invitations/                      # Thread invitations
│   ├── activity/                         # User activity logging
│   ├── feedback/                         # In-app feedback widget submissions
│   ├── search/                           # Local full-text search
│   ├── admin/                            # Admin dashboard data
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
│   │   ├── logger.ts                     # Structured logging
│   │   ├── prisma.ts                     # Prisma Client (Neon adapter)
│   │   ├── redis.ts                      # ioredis connection factory
│   │   ├── redis-upstash.ts              # Upstash REST Redis client
│   │   └── query-cache.ts                # Redis/in-memory query cache
│   ├── queue/
│   │   ├── config.ts                     # AIJobType enum
│   │   ├── types.ts                      # Job data interfaces
│   │   └── workers/
│   │       ├── ai.worker.ts              # AI job handlers (summary, DNA, score, conflicts, inline, staleness)
│   │       └── email.worker.ts           # Email job handler
│   ├── schemas/
│   │   ├── api.ts                        # API request/response schemas
│   │   ├── database.ts                   # Prisma model schemas
│   │   ├── thread-dna.ts                 # ThreadDNA Zod schema
│   │   └── user-preferences.ts           # User preference schema
│   ├── services/
│   │   ├── ai.ts                         # GeminiService + OpenAIService (summaries, DNA, conflicts, toxicity)
│   │   ├── ai-langchain.ts               # LangChain map-reduce summarization
│   │   ├── ai-spend-cap.ts               # Dollar-based daily AI spend limit
│   │   ├── ai-usage-logger.ts            # Per-request token/cost logging
│   │   ├── ai-cost-classification.ts     # Request cost tiering
│   │   ├── ai-sentinel.ts                # AI-not-configured guard
│   │   ├── daily-quota.ts                # Per-user/day Redis quotas
│   │   ├── auth.ts                       # Better Auth configuration
│   │   ├── auth-client.ts                # Client-side auth
│   │   ├── email.ts                      # Resend (sendEmail, sendOTPEmail, etc.)
│   │   ├── moderation.ts                 # Regex + AI content moderation
│   │   ├── moderation-sla.ts             # Stale report escalation
│   │   ├── content-safety.ts             # Profanity filtering, file validation
│   │   ├── rate-limit.ts                 # Redis-based rate limiting with in-memory fallback
│   │   ├── queue.ts                      # QStash job enqueueing
│   │   ├── job-dedup.ts                  # Job deduplication
│   │   ├── idempotency.ts                # Idempotency keys
│   │   ├── counter-reconciliation.ts     # Denormalized counter repair
│   │   ├── soft-delete-purge.ts          # Purges soft-deleted users after 30 days
│   │   └── usage-check.ts                # Usage limit checks
│   ├── middleware/
│   │   └── moderation.ts                 # requireModerator(), requireAdmin()
│   ├── actions/
│   │   └── result.ts                     # ActionEnvelope, ActionErrorCode, actionSuccess/actionFailure
│   ├── types/
│   │   └── index.ts                      # Barrel re-export from module types
│   ├── utils/
│   │   ├── api-response.ts               # ok(), fail() API response helpers
│   │   ├── confidence-decay.ts           # applyConfidenceDecay() for resolution scores
│   │   ├── retry.ts                      # withRetry() for external API calls
│   │   ├── server-action.ts              # createServerAction, withValidation
│   │   ├── slug.ts                       # Slug generation
│   │   ├── toast.ts                      # Client-side toast notifications
│   │   ├── mention-parser.ts             # parseMentions(), resolveUserMentions()
│   │   ├── cron-auth.ts                  # Cron Bearer token verification
│   │   ├── prompt-boundary.ts            # Prompt injection boundaries
│   │   ├── render-content.tsx            # Content rendering
│   │   ├── file-upload.ts                # Upload helpers
│   │   ├── password-validation.ts        # Password rules
│   │   ├── escape.ts                     # String escaping
│   │   ├── cn.ts                         # Tailwind class merging
│   │   ├── errors.ts                     # Error types
│   │   ├── validation-common.ts          # Shared validation schemas (pagination)
│   │   ├── client-logger.ts              # Client-side logging
│   │   └── api-interceptor.ts            # Client API interceptor
│   ├── db/
│   │   └── pagination.ts                 # Cursor-based pagination
│   ├── thread-access.ts                  # Thread authorization primitive
│   └── sanitize.ts                       # Input sanitization
│
├── prisma/
│   ├── schema.prisma                     # 30 models
│   ├── seed.ts                           # Database seed script
│   └── migrations/                       # Database migrations
│
├── test/                                 # Mocha unit tests (297 passing)
├── test/e2e/                             # Playwright end-to-end tests
├── docs/                                 # Documentation (incl. former shared/)
├── scripts/                              # Build/dev scripts
```

---

## Module Pattern

Modules follow a consistent pattern, with `schemas.ts` present in most modules.

```
modules/{feature}/
├── actions.ts      — Server Actions (called from UI).
│                     Always returns: { data, error, ok, errorCode }
│                     Never throws. Always wraps in try/catch.
├── repository.ts   — DB queries via Prisma. Typed returns, never `any`.
├── service.ts      — Business logic, AI calls, cross-module orchestration (optional)
├── types.ts        — Module-specific types (optional)
├── schemas.ts      — Zod validation schemas (present in most modules)
├── index.ts        — Public exports (optional)
└── ...             — Module-specific files (executors.ts, policy.ts, cache.ts, etc.)
```

**23 modules total:**
- `actions.ts`: present in most
- `repository.ts`: present in most
- `service.ts`: few (threads, ai-search, messages, newsletter)
- `types.ts`: ~half
- `schemas.ts`: present in most
- `index.ts`: ~half

---

## Data Model — Key Entities (30 Prisma models)

### Thread
The central entity. Stores AI metadata directly:
- `resolutionScore: Int?` — 0-100, calculated by QStash job
- `isOutdated: Boolean` — set by staleness detection cron
- `aiSummary: String?` — cached summary, regenerated via LangChain
- `threadDna: Json?` — `{ questionType, expertiseLevel, topics[], readTimeMinutes }`
- `lastVerifiedAt: DateTime?` — when AI last checked sources
- `visibility: Enum` — PUBLIC, PRIVATE, RESTRICTED
- `deletedAt: DateTime?` — soft delete

### Message
- `parentId: String?` — null = root post, enables tree structure
- `depth: Int` — 0=root, max 4 for visual nesting
- `isAiResponse: Boolean` — true for @sai inline responses
- `isEdited: Boolean` — tracks edit history
- `isPinned: Boolean` — pin status (one per thread)
- `likeCount: Int` — denormalized, updated atomically
- `replyCount: Int` — denormalized, updated atomically
- `deletedAt: DateTime?` — soft delete, node preserved for tree integrity

### User
- `role: Enum` — USER, MODERATOR, ADMIN
- `status: Enum` — ACTIVE, SUSPENDED, BANNED
- `profilePrivacy: Enum` — PUBLIC, PRIVATE, FOLLOWERS_ONLY
- `isPro: Boolean` — pro subscription status
- `preferences: Json` — notification, theme, AI settings
- `deletedAt: DateTime?` — soft delete

### Other Key Models
- `Notification` — typed notifications (MENTION, REPLY, REACTION, NEW_MESSAGE, PINNED)
- `Report` / `Appeal` / `UserBan` — moderation pipeline
- `Poll` / `PollVote` — in-thread polls
- `AiSearchSession` / `AiSearchResult` — AI search caching
- `ThreadRelation` — semantic similarity between threads (0.0–1.0)
- `MessageEdit` — message edit history
- `MessageMention` — @mention records
- `ReadReceipt` — thread read tracking
- `ThreadSubscription` — newsletter/digest subscriptions
- `ThreadInvitation` — thread invite records
- `UserFollow` / `UserBookmark` — social features
- `ThreadTag` / `ThreadTagRelation` — tagging
- `ModerationRule` — CHECK constraints on rules
- `UserActivity` — CHECK constraint on activity
- `AiUsageLog` — costUsd tracking
- `Feedback` — user feedback
- `Account` / `Session` / `Verification` — Better Auth tables

---

## Features & Functions

### Authentication & User Management

| Feature | Implementation |
|---------|---------------|
| Email OTP sign-in | `app/api/sign-in/email-otp/route.ts` → Better Auth |
| Google OAuth | `lib/services/auth.ts` (Google provider) |
| GitHub OAuth | `lib/services/auth.ts` (GitHub provider) |
| Forgot password (3-step OTP) | `app/(public)/forgot-password/` (email → verify → reset) |
| Email verification OTP | `app/api/email-otp/send-verification-otp/route.ts` |
| Session management | `modules/auth/session.ts` → Better Auth sessions |
| Protected routes | `app/(protected)/` layout with auth guard |
| User profile (view) | `app/(protected)/user/[userId]/page.tsx` |
| Profile settings | `app/(protected)/dashboard/settings/profile/page.tsx` |
| Avatar upload | `modules/users/actions.ts:uploadAvatar` → Vercel Blob |
| Banner upload | `modules/users/actions.ts:uploadBanner` → Vercel Blob |
| User preferences | `components/settings/preferences-form.tsx` (theme, notifications) |
| Profile privacy | `modules/users/actions.ts:updateProfilePrivacyAction` |
| Role system | USER, MODERATOR, ADMIN (Prisma enum) |
| Status system | ACTIVE, SUSPENDED, BANNED (Prisma enum) |
| Banned user page | `app/banned/page.tsx` |
| Bootstrap endpoint | `GET /api/bootstrap` — user + unread notification count + recent activity |

### Thread & Discussion

| Feature | Implementation |
|---------|---------------|
| Create thread | `modules/threads/actions.ts:createThreadAction` |
| Delete thread (soft) | `modules/threads/actions.ts:deleteThreadAction` |
| Thread list (dashboard) | `app/(protected)/dashboard/threads/page.tsx` |
| Thread detail (by slug) | `app/(protected)/dashboard/threads/[slug]/page.tsx` |
| Nested reply tree (depth 4) | `components/thread/comment-tree.tsx` + `message-list.tsx` |
| Thread DNA analysis | `POST /api/ai/thread-dna` → QStash → `Thread.threadDna` |
| Resolution score | `POST /api/ai/resolution-score` → QStash → `Thread.resolutionScore` |
| Thread summary (LangChain) | `POST /api/ai/thread-summary` → QStash → `Thread.aiSummary` |
| Thread tagging (backend) | `modules/tags/actions.ts` (CRUD, thread-tag associations) |
| Thread invitations (backend) | `modules/invitations/actions.ts` |
| Thread membership | `modules/members/repository.ts:getMemberRole` |
| Thread access control | PRIVATE/RESTRICTED visibility via `modules/threads/access.ts` |
| Related threads | `components/thread/related-threads-card.tsx` → `ThreadRelation` |
| Tags browser | `app/(protected)/dashboard/tags/[slug]/page.tsx` |

### Messages

| Feature | Implementation |
|---------|---------------|
| Post message | `modules/messages/actions/post.ts:postMessage` |
| Edit message (with history) | `modules/messages/actions/edit.ts:editMessage` |
| Pin message | `modules/messages/actions/edit.ts:pinMessage` (one per thread) |
| Delete message (soft) | `modules/messages/actions/delete.ts:deleteMessage` |
| @mentions | `modules/messages/actions/mentions.ts` (create, search, notify) |
| Mention autocomplete | `components/thread/mention-suggest.tsx` (debounced search) |
| @sai inline responses | `modules/messages/actions/ai-inline.ts` → SSE stream to poster (primary) or QStash job (fallback) |
| AI inline pending status | `thread-live-wrapper.tsx` (2-min timeout, pending/failed tracking) |

### Real-time Communication

| Feature | Implementation |
|---------|---------------|
| SSE streaming | `app/api/threads/[threadId]/ai-reply/stream/route.ts` |
| AI reply tokens | Streamed via Server-Sent Events |
| Message updates | Client-side polling |
| Typing indicators | Not implemented (forum-style platform) |

### AI-Powered Features

| Feature | Implementation |
|---------|---------------|
| AI search (Exa + Tavily) | `app/api/ai/forum-search/route.ts` → `modules/ai-search/service.ts` |
| Query classification | Gemini Flash → type, searchTerms, isControversial |
| Parallel search | Promise.allSettled (Exa + Tavily) |
| Source tier assignment | T1=official, T2=SO/HN, T3=Reddit, T4=blogs |
| Synthesis (streamed) | Gemini Pro → ReadableStream response |
| Confidence scoring | 0-100 based on tier mix, agreement, freshness |
| Semantic cache | SHA-256 query-hash cache (`modules/ai-search/cache.ts`) |
| Daily search quota | Per-user/day Redis quota (`daily-quota.ts`) |
| Thread DNA | questionType, expertiseLevel, topics[], readTimeMinutes |
| Resolution score | 0-100 with confidence decay over time |
| Conflict detection | AI identifies contradictory facts in threads |
| Thread summary (LangChain) | Map-reduce: split → parallel summarize → combine |
| AI inline (@sai) | User types @sai in message → SSE stream with QStash-job fallback |
| Staleness detection | Thread age threshold, checks if thread needs updating |
| AI insight notifications | Score change ≥20pts or conflict detected → notify subscribers |

### Background Jobs (QStash + Vercel Cron)

| Job | Trigger | Result |
|-----|---------|--------|
| Thread summary | 50+ messages or manual | `Thread.aiSummary` |
| Thread DNA | 3rd message posted | `Thread.threadDna` |
| Resolution score | 5+ messages or daily cron | `Thread.resolutionScore` |
| Conflict detection | New message arrives | Notification to subscribers |
| Daily digest | Daily cron | Email via Resend |
| AI insight notifications | Score change / conflict | Notification table |
| AI inline | @sai in message (fallback path) | Streaming AI response |
| Staleness check | Daily cron | `Thread.isOutdated` flag |
| Email | Various | Resend send |

### Moderation & Administration

| Feature | Implementation |
|---------|---------------|
| Regex moderation rules | `modules/moderation/` + `lib/services/moderation.ts` |
| AI inline moderation | Content filtered before posting |
| Report creation | `modules/reports/actions.ts:createReport` |
| Report resolution | `modules/reports/actions.ts:resolveReport` |
| Moderation queue | `app/api/v1/moderation/queue/route.ts` |
| Ban user | `modules/moderation/actions.ts:banUser` |
| Ban appeals | `modules/appeals/actions.ts` (submit, review, resolve) |
| Bulk delete messages | `modules/moderation/actions.ts:bulkDeleteMessages` |
| Admin dashboard | `app/(protected)/dashboard/admin/page.tsx` |
| System health endpoint | `GET /api/health` (DB, Redis, AI checks) |

### Notifications & Engagement

| Feature | Implementation |
|---------|---------------|
| In-app notifications | `modules/notifications/` (typed: MENTION, REPLY, REACTION, NEW_MESSAGE, PINNED) |
| Follow/unfollow users | `modules/follows/actions.ts` |
| Thread bookmarking | `modules/bookmarks/actions.ts:toggleBookmark` |
| Emoji reactions | `modules/reactions/actions.ts:toggleReaction` |
| Read receipts | `modules/read-receipts/actions.ts:markThreadReadAction` |
| Activity feed | `modules/activity/actions.ts` |
| Thread subscriptions | `modules/newsletter/actions.ts` |
| Polls | `modules/polls/actions.ts` |

### Search & Discovery

| Feature | Implementation |
|---------|---------------|
| Local full-text search | `app/api/search/route.ts` + `modules/search/actions.ts` |
| AI-powered search | `app/(protected)/dashboard/sai-search/page.tsx` |
| Tags browser | `app/(protected)/dashboard/tags/[slug]/page.tsx` |
| Related threads | `components/thread/related-threads-card.tsx` |

### Email

| Feature | Implementation |
|---------|---------------|
| OTP email | `lib/services/email.ts:sendOTPEmail` |
| Welcome email | `lib/services/email.ts:sendWelcomeEmail` |
| Password reset email | `lib/services/email.ts:sendPasswordResetEmail` |
| Mention notification email | `lib/services/email.ts:sendMentionNotification` |
| Daily digest email | `lib/services/email.ts:sendNewsletterDigest` |

---

## Real-time Architecture

This is a serverless, forum-style platform. There are no persistent WebSocket connections.

- **AI reply streaming**: GET endpoint at `/api/threads/[threadId]/ai-reply/stream` uses Server-Sent Events
- **Message updates**: Clients poll for new messages
- **Typing indicators**: Not implemented (forum-style platform)

Background jobs are processed via Upstash QStash webhooks and Vercel Cron.

---

## Security Rules

- All inputs validated with Zod before any processing
- All server actions return `{ data, error, ok, errorCode }`, never throw
- API keys (Exa, Tavily, Gemini) never logged, never stored in DB
- User content sanitized before passing to AI prompts
- Path traversal prevention on all file operations
- DB + Redis state updated atomically via Prisma $transaction
- AbortController + 15s timeout on every external API call
- withRetry(fn, 3, 300) exponential backoff on external APIs
- Promise.allSettled — one failed API never crashes full response
- Error boundaries at every route level
- Internal DB errors never leaked to client error messages
- Rate limiting on all AI endpoints (Upstash Redis)
- Per-user daily AI search quota via Redis
- Thread visibility enforcement via `modules/threads/access.ts`

---

## Deployment

- **Host:** Vercel (serverless)
- **Database:** Neon PostgreSQL (serverless)
- **Redis:** Upstash (serverless)
- **Storage:** Vercel Blob
- **CI/CD:** GitHub Actions → auto-deploy on main

### Commands

```bash
pnpm dev            # Next.js dev server
pnpm build          # Prisma generate + Next build
pnpm start          # Production server
pnpm test           # Mocha unit tests
pnpm typecheck      # TypeScript check
pnpm lint           # ESLint
```
