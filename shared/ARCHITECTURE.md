# Sastram Architecture Documentation

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
- **Database:** PostgreSQL via Prisma ORM (Neon serverless), 33 models
- **Real-time:** Background Jobs: Upstash QStash + Vercel Cron
- **Authentication:** Better Auth (email OTP + Google + GitHub)
- **Cache / Rate Limit:** Upstash Redis
- **File Storage:** Vercel Blob Storage (`lib/services/blob.ts`)
- **Email:** Nodemailer (SMTP) — `lib/services/email.ts`
- **AI — Search:** Exa API + Tavily API (via `modules/ai-search/service.ts`)
- **AI — Synthesis:** Google Gemini Flash (classify/DNA) + Pro (synthesis)
- **AI — LangChain:** Map-reduce summarization via `lib/services/ai-langchain.ts`
- **State Management:** TanStack Query (chat/messages) + Zustand (thread view)
- **E2E Testing:** Playwright (`e2e/`)

---

## System Architecture

```
Browser Client
│
├── HTTP / Server Actions → Next.js App Router
│   │
│   ├── modules/ (domain logic — 29 modules)
│   │   │
│   │   ├── Prisma → PostgreSQL (Neon)
│   │   ├── Upstash Redis (cache + rate limit)
│   │   ├── QStash → background jobs (thread summary, DNA, score, conflicts)
│   │   ├── Vercel Cron → scheduled tasks (daily digest, staleness check)
│   │   ├── Vercel Blob (file storage)
│   │   ├── Gemini / Exa / Tavily (AI)
│   │   └── Nodemailer (SMTP email)
│   │
│   └── API Routes (29 REST endpoints)
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
│   │   │   ├── threads/                  # Thread list + detail ([slug])
│   │   │   ├── messages/                 # Messages/inbox
│   │   │   ├── notifications/            # Notifications page
│   │   │   ├── bookmarks/                # Bookmarked threads
│   │   │   ├── search/                   # Local search
│   │   │   ├── ai-search/                # AI-powered search
│   │   │   ├── activity/                 # User activity feed
│   │   │   ├── tags/                     # Tags browser ([slug])
│   │   │   ├── settings/                 # Account settings + profile
│   │   │   └── admin/                    # Admin (tags, moderation, reports, appeals, health)
│   │   └── user/[userId]/                # Public user profile
│   ├── chat/                             # Real-time chat
│   ├── [community]/[thread]/             # Community thread view (public URL)
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
│       │   ├── resolution-score/         # Resolution score calculation
│       │   └── jobs/                     # AI job status + cancel
│       ├── threads/                      # Thread REST + [threadId]/ai-reply
│       ├── messages/                     # Message REST (POST)
│       ├── conversations/                # Chat conversations (GET, POST)
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
│   ├── thread/                           # comment-tree, message-list, message-node, RightPanel, poll-*, subscribe-button, thread-live-wrapper
│   ├── chat/                             # post-message-form, mention-suggest, typing-indicator
│   ├── dashboard/                        # settings-form, preferences-form, header, sidebar, StatsCard, TopicCard
│   ├── panels/                           # RightPanel (ThreadInfoCard, ThreadDnaCard, AiSynthesisCard, RelatedThreadsCard, ParticipantsCard)
│   ├── notifications/                    # notification-list
│   ├── landing/                          # LandingPage
│   ├── layout/                           # Layout components
│   ├── auth/                             # LoginForm, ForgotPasswordModal
│   ├── admin/                            # Admin components
│   ├── appeals/                          # Appeal components
│   └── ui/                               # shadcn/ui + TimeAgo, ErrorBoundary, LoadingVideo, ThemeToggle
│
├── hooks/
│   ├── useThreadWebSocket.ts             # Thread polling hook
│   ├── useMessages.ts                    # React Query: conversation messages
│   ├── useConversations.ts              # React Query: chat conversations
│   ├── use-debounce.ts                   # Generic debounce hook
│   └── chat/use-websocket.ts            # Chat polling hook
│
├── stores/
│   └── thread-view-store.ts             # useSyncExternalStore: current thread slug
│
├── modules/                              # Domain logic (29 modules)
│   ├── auth/                             # Session management, OAuth
│   ├── users/                            # User CRUD, profiles, avatar/banner upload
│   ├── threads/                          # Thread CRUD, membership, slug routing, relations
│   ├── messages/                         # Post, edit, pin, delete, mentions, AI inline
│   ├── chat/                             # Real-time chat (conversations, messages)
│   ├── ai-search/                        # Exa + Tavily + Gemini pipeline, caching, query warming
│   ├── moderation/                       # Regex rules, content filtering, AI inline moderation
│   ├── reports/                          # Report creation, resolution, executors
│   ├── appeals/                          # Ban appeal submission and review
│   ├── notifications/                    # In-app notifications, bulk creation
│   ├── newsletter/                       # Email digest subscriptions, processing
│   ├── follows/                          # User follow/unfollow
│   ├── bookmarks/                        # Thread bookmarking
│   ├── reactions/                        # Emoji reactions on messages
│   ├── read-receipts/                    # Thread read tracking
│   ├── tags/                             # Tag CRUD, thread-tag associations
│   ├── topics/                           # Topic creation (thread categories)
│   ├── communities/                      # Community groups
│   ├── members/                          # Thread membership management
│   ├── polls/                            # Poll creation, voting, results
│   ├── invitations/                      # Thread invitations
│   ├── activity/                         # User activity logging
│   ├── reputation/                       # Reputation points system
│   ├── badges/                           # Badge definitions and awarding
│   ├── search/                           # Local full-text search
│   ├── admin/                            # Admin dashboard data
│   ├── policy/                           # Policy enforcement
│   ├── audit/                            # Audit logging
│   └── ws/                               # WebSocket types, publisher, cross-instance delivery
│
├── lib/
│   ├── config/
│   │   ├── env.ts                        # Zod-validated environment variables
│   │   ├── constants.ts                  # File limits, magic numbers
│   │   ├── permissions.ts                # Role-based access control
│   │   └── routes.ts                     # Route constants
│   ├── infrastructure/
│   │   ├── bullmq.ts                     # Backward-compatible re-export barrel
│   │   ├── logger.ts                     # Structured logger with request IDs
│   │   ├── prisma.ts                     # Prisma Client (Neon adapter)
│   │   ├── redis-connection.ts           # Redis connection factory
│   │   ├── redis-pubsub.ts              # Redis pub/sub for cross-instance events
│   │   ├── redis-upstash.ts             # Upstash Redis client
│   │   └── query-cache.ts              # Redis/in-memory query cache
│   ├── queue/
│   │   ├── config.ts                     # QUEUE_NAMES (9), DEFAULT_JOB_OPTIONS, AIJobType enum (7)
│   │   ├── types.ts                      # Job data interfaces (ThreadSummaryJobData, etc.)
│   │   └── workers/
│   │       ├── ai.worker.ts              # AI job handlers (summary, DNA, score, conflicts, inline, staleness)
│   │       └── email.worker.ts           # Email job handler
│   ├── schemas/
│   │   ├── api.ts                        # API request/response schemas
│   │   ├── database.ts                   # Prisma model schemas
│   │   ├── thread-dna.ts                 # ThreadDNA Zod schema
│   │   ├── user-preferences.ts           # User preferences schema
│   │   └── websocket.ts                  # WebSocket message validation
│   ├── services/
│   │   ├── ai.ts                         # GeminiService + OpenAIService (summaries, DNA, conflicts, toxicity)
│   │   ├── ai-langchain.ts              # LangChain map-reduce summarization
│   │   ├── ai-inline-rate-limit.ts       # AI inline rate limiting
│   │   ├── ai-search-quota.ts            # Per-user daily AI search quota (20/day)
│   │   ├── auth.ts                       # Better Auth configuration
│   │   ├── auth-client.ts               # Client-side auth
│   │   ├── blob.ts                       # Vercel Blob storage wrapper
│   │   ├── content-safety.ts            # Profanity filtering, file validation
│   │   ├── email.ts                      # Nodemailer SMTP (sendEmail, sendOTPEmail, etc.)
│   │   ├── moderation.ts                 # Regex + AI content moderation
│   │   └── rate-limit.ts                 # Redis-based rate limiting with buckets
│   ├── middleware/
│   │   └── moderation.ts                # requireModerator(), requireAdmin()
│   ├── actions/
│   │   └── result.ts                     # ActionErrorCode, actionFailure
│   ├── templates/
│   │   └── email-templates.ts            # Email HTML templates
│   ├── types/
│   │   └── index.ts                      # Barrel re-export from module types
│   ├── utils/
│   │   ├── api-response.ts              # ok(), fail() API response helpers
│   │   ├── confidence-decay.ts           # applyConfidenceDecay() for resolution scores
│   │   ├── retry.ts                      # withRetry() for external API calls
│   │   ├── server-action.ts              # createServerAction, withValidation
│   │   ├── slug.ts                       # Slug generation
│   │   ├── toast.ts                      # Client-side toast notifications
│   │   ├── mention-parser.ts            # parseMentions(), resolveUserMentions()
│   │   └── validation-common.ts         # Shared validation schemas (pagination)
│   ├── db/
│   │   └── pagination.ts                # Cursor-based pagination
│   ├── dedupe.ts                         # In-flight request deduplication
│   └── sanitize.ts                       # API key validation, input sanitization
│
├── prisma/
│   ├── schema.prisma                     # 33 models
│   ├── seed.ts                           # Database seed script
│   └── migrations/                       # Database migrations
│
├── test/                                 # Mocha unit tests (256+ passing)
├── e2e/                                  # Playwright end-to-end tests
├── docs/                                 # Documentation
├── scripts/                              # Build/dev scripts
└── shared/
    └── ARCHITECTURE.md                   # This file
```

---

## Module Pattern

Modules follow a consistent pattern, with `schemas.ts` present in every module.

```
modules/{feature}/
├── actions.ts      — Server Actions (called from UI).
│                     Always returns: { data, error, ok, errorCode }
│                     Never throws. Always wraps in try/catch.
├── repository.ts   — DB queries via Prisma. Typed returns, never `any`.
├── service.ts      — Business logic, AI calls, cross-module orchestration (optional)
├── types.ts        — Module-specific types (optional)
├── schemas.ts      — Zod validation schemas (present in all 29 modules)
├── index.ts        — Public exports (optional)
└── ...             — Module-specific files (executors.ts, policy.ts, cache.ts, etc.)
```

**Actual file counts across 29 modules:**
- `actions.ts`: 26/29 (missing in ai-search, audit, ws)
- `repository.ts`: 25/29 (missing in appeals, chat, messages, reports)
- `service.ts`: 4/29 (threads, ai-search, messages, newsletter)
- `types.ts`: 17/29
- `schemas.ts`: 29/29 (universal)
- `index.ts`: 18/29

---

## Data Model — Key Entities (33 Prisma models)

### Thread
The central entity. Stores AI metadata directly:
- `resolutionScore: Int?` — 0-100, calculated by QStash job
- `isOutdated: Boolean` — set by staleness detection cron
- `aiSummary: String?` — cached summary, regenerated via LangChain
- `threadDna: Json?` — `{ questionType, expertiseLevel, topics[], readTimeMinutes, hasResolution }`
- `lastVerifiedAt: DateTime?` — when AI last checked sources
- `visibility: Enum` — PUBLIC, PRIVATE, RESTRICTED
- `deletedAt: DateTime?` — soft delete

### Message
- `parentId: String?` — null = root post, enables tree structure
- `depth: Int` — 0=root, max 4 for visual nesting
- `isAiResponse: Boolean` — true for @ai inline responses
- `isEdited: Boolean` — tracks edit history
- `isPinned: Boolean` — pin status (one per thread)
- `likeCount: Int` — denormalized, updated atomically
- `replyCount: Int` — denormalized, updated atomically
- `deletedAt: DateTime?` — soft delete, node preserved for tree integrity

### User
- `role: Enum` — USER, MODERATOR, ADMIN
- `status: Enum` — ACTIVE, SUSPENDED, BANNED
- `profilePrivacy: Enum` — PUBLIC, PRIVATE, FOLLOWERS_ONLY
- `reputationPoints: Int` — gamification points
- `isPro: Boolean` — pro subscription status
- `preferences: Json` — notification, theme, AI settings

### Other Key Models
- `ThreadMember` — membership with roles (OWNER, MODERATOR, MEMBER)
- `Notification` — typed notifications (MENTION, REPLY, REACTION, NEW_MESSAGE, PINNED)
- `Report` / `Appeal` / `UserBan` — moderation pipeline
- `Poll` / `PollVote` — in-thread polls
- `AiSearchSession` / `AiSearchResult` — AI search caching
- `ThreadRelation` — semantic similarity between threads (0.0–1.0)
- `MessageEdit` — message edit history
- `MessageMention` — @mention records
- `ReadReceipt` — thread read tracking
- `ThreadSubscription` — newsletter/digest subscriptions

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
| User preferences | `components/dashboard/preferences-form.tsx` (theme, notifications) |
| Profile privacy | `modules/users/actions.ts:updateProfilePrivacyAction` |
| Role system | USER, MODERATOR, ADMIN (Prisma enum) |
| Status system | ACTIVE, SUSPENDED, BANNED (Prisma enum) |
| Banned user page | `app/banned/page.tsx` |
| Bootstrap endpoint | `GET /api/bootstrap` — user + notifications + activity + reputation |

### Thread & Discussion

| Feature | Implementation |
|---------|---------------|
| Create thread | `modules/threads/actions.ts:createThreadAction` |
| Delete thread (soft) | `modules/threads/actions.ts:deleteThreadAction` |
| Thread list (dashboard) | `app/(protected)/dashboard/threads/page.tsx` |
| Thread detail (by slug) | `app/(protected)/dashboard/threads/[slug]/page.tsx` |
| Thread view (public/flat) | `app/thread/[slug]/page.tsx` |
| Nested reply tree (depth 4) | `components/thread/comment-tree.tsx` + `message-list.tsx` |
| Virtual scrolling | `@tanstack/react-virtual` in `message-list.tsx` |
| Load older messages | `thread-live-wrapper.tsx:loadMoreMessages` (cursor pagination) |
| Pinned message banner | `thread-live-wrapper.tsx` lines 379-399 |
| Thread DNA analysis | `POST /api/ai/thread-dna` → QStash → `Thread.threadDna` |
| Resolution score | `POST /api/ai/resolution-score` → QStash → `Thread.resolutionScore` |
| Thread summary (LangChain) | `POST /api/ai/thread-summary` → QStash → `Thread.aiSummary` |
| Thread tagging (backend) | `modules/tags/actions.ts` (CRUD, thread-tag associations) |
| Thread invitations (backend) | `modules/invitations/actions.ts` |
| Thread membership | `modules/members/actions.ts` (join, leave, invite, role management) |
| Thread access control | PRIVATE/RESTRICTED visibility with membership checks |
| Related threads | `components/panels/RelatedThreadsCard.tsx` → `ThreadRelation` |
| Create topic | `modules/topics/actions.ts:createTopic` |
| Tags browser | `app/(protected)/dashboard/tags/[slug]/page.tsx` |

### Messages

| Feature | Implementation |
|---------|---------------|
| Post message | `modules/messages/actions/post.ts:postMessage` |
| Edit message (with history) | `modules/messages/actions/edit.ts:editMessage` |
| Edit history | `modules/messages/actions/edit.ts:getMessageEditHistory` |
| Pin message | `modules/messages/actions/edit.ts:pinMessage` (one per thread) |
| Delete message (soft) | `modules/messages/actions/delete.ts:deleteMessage` |
| Message attachments | `app/api/messages/route.ts` (multipart upload) |
| @mentions | `modules/messages/actions/mentions.ts` (create, search, notify) |
| Mention autocomplete | `components/chat/mention-suggest.tsx` (debounced search) |
| @ai inline responses | `modules/messages/actions/ai-inline.ts` → QStash job |
| AI inline pending status | `thread-live-wrapper.tsx` (2-min timeout, pending/failed tracking) |
| "Edited" label | `message-list.tsx` line 304-306 |
| Deleted placeholder | `message-list.tsx` lines 230-248 ("This message was deleted") |

### Real-time Communication

| Feature | Implementation |
|---------|---------------|
| SSE streaming | `app/api/threads/[threadId]/ai-reply/stream/route.ts` |
| AI reply tokens | Streamed via Server-Sent Events |
| Message updates | Client-side polling |
| Typing indicators | Not implemented (forum-style platform) |

### Chat

| Feature | Implementation |
|---------|---------------|
| Chat conversations | `app/chat/page.tsx` + `modules/chat/actions.ts` |
| Create conversation | `modules/chat/actions.ts:createConversation` |
| Send/receive messages | `hooks/useMessages.ts` (React Query) |
| Chat polling | `hooks/chat/use-websocket.ts` |
| Conversation list | `hooks/useConversations.ts` |

### AI-Powered Features

| Feature | Implementation |
|---------|---------------|
| AI search (Exa + Tavily) | `app/api/ai/forum-search/route.ts` → `modules/ai-search/service.ts` |
| Query classification | Gemini Flash → type, searchTerms, isControversial |
| Parallel search | Promise.allSettled (Exa + Tavily) |
| Source tier assignment | T1=official, T2=SO/HN, T3=Reddit, T4=blogs |
| Synthesis (streamed) | Gemini Pro → ReadableStream response |
| Confidence scoring | 0-100 based on tier mix, agreement, freshness |
| Semantic cache | pgvector cosine similarity > 0.92 → skip API calls |
| Daily search quota | 20 searches/user/day (`ai-search-quota.ts`) |
| User-supplied API keys | localStorage only, sent in headers, never stored |
| Thread DNA | questionType, expertiseLevel, topics[], readTimeMinutes |
| Resolution score | 0-100 with confidence decay over time |
| Conflict detection | AI identifies contradictory facts in threads |
| Thread summary (LangChain) | Map-reduce: split → parallel summarize → combine |
| AI inline (@ai) | User types @ai in message → QStash job → streaming response |
| Staleness detection | 30-day threshold, checks if thread needs updating |
| AI insight notifications | Score change ≥20pts or conflict detected → notify subscribers |

### Background Jobs (QStash + Vercel Cron)

**QStash jobs** are triggered by API routes and enqueued via `lib/services/queue.ts`.

**Vercel Cron** runs scheduled tasks via `vercel.json`.

| Job | Trigger | Result |
|-----|---------|--------|
| Thread summary | 50+ messages or manual | `Thread.aiSummary` |
| Thread DNA | 3rd message posted | `Thread.threadDna` |
| Resolution score | 5+ messages or daily cron | `Thread.resolutionScore` |
| Conflict detection | New message arrives | Notification to subscribers |
| Daily digest | Daily cron (3 AM UTC) | Email via Nodemailer |
| AI insight notifications | Score change / conflict | Notification table |
| AI inline | @ai in message | Streaming AI response |
| Staleness check | Daily cron | `Thread.isOutdated` flag |
| Email | Various | Nodemailer send |

**Job options:** 3 retries via QStash.

### Moderation & Administration

| Feature | Implementation |
|---------|---------------|
| Regex moderation rules | `modules/moderation/` + `lib/services/moderation.ts` |
| AI inline moderation | Content filtered before posting |
| Report creation | `modules/reports/actions.ts:createReport` |
| Report resolution | `modules/reports/actions.ts:resolveReport` |
| Moderation queue | `app/api/v1/moderation/queue/route.ts` |
| Moderation stats | `app/api/v1/moderation/stats/route.ts` |
| Moderation rules CRUD | `app/api/v1/moderation/rules/route.ts` |
| Ban user | `modules/moderation/actions.ts:banUser` |
| Unban user | `modules/moderation/actions.ts:unbanUser` |
| Ban appeals | `modules/appeals/actions.ts` (submit, review, resolve) |
| Bulk delete messages | `modules/moderation/actions.ts:bulkDeleteMessages` |
| Admin dashboard | `app/(protected)/dashboard/admin/page.tsx` |
| Admin reports page | `app/(protected)/dashboard/admin/reports/page.tsx` |
| Admin appeals page | `app/(protected)/dashboard/admin/appeals/page.tsx` |
| Admin tags management | `app/(protected)/dashboard/admin/tags/page.tsx` |
| Admin health page | `app/(protected)/dashboard/admin/health/page.tsx` |
| System health endpoint | `GET /api/health` (DB, Redis, AI checks) |
| Admin health endpoint | `GET /api/admin/health` (memory, uptime, WS stats) |

### Notifications & Engagement

| Feature | Implementation |
|---------|---------------|
| In-app notifications | `modules/notifications/` (typed: MENTION, REPLY, REACTION, NEW_MESSAGE, PINNED) |
| Notification list | `components/notifications/notification-list.tsx` (grouped by time) |
| Mark read (single) | `modules/notifications/actions.ts:markNotificationRead` |
| Mark all read | `modules/notifications/actions.ts:markAllNotificationsRead` |
| Unread count | `modules/notifications/actions.ts:getUnreadNotificationCount` |
| Bulk notification creation | `modules/notifications/repository.ts:createBulkNotifications` |
| Email notifications | `lib/services/email.ts` (mention, follow, invitation emails) |
| Follow/unfollow users | `modules/follows/actions.ts` |
| Thread bookmarking | `modules/bookmarks/actions.ts:toggleBookmark` |
| Emoji reactions | `modules/reactions/actions.ts:toggleReaction` |
| Read receipts | `modules/read-receipts/actions.ts:markThreadReadAction` (auto after 30s) |
| Activity feed | `modules/activity/actions.ts` (record, get, followed users) |
| Reputation system | `modules/reputation/actions.ts` (points, awards, sync) |
| Badges | `modules/badges/actions.ts` (check, award, list) |
| Thread subscriptions | `modules/newsletter/actions.ts` (Daily, Weekly, Never frequency) |
| Polls | `modules/polls/actions.ts` (create, vote, close, results) |

### Search & Discovery

| Feature | Implementation |
|---------|---------------|
| Local full-text search | `app/api/search/route.ts` + `modules/search/actions.ts` |
| Thread search | `modules/search/actions.ts:searchThreadsAction` |
| Message search | `modules/search/actions.ts:searchMessagesAction` |
| User search | `modules/search/actions.ts:searchUsersAction` |
| AI-powered search | `app/(protected)/dashboard/ai-search/page.tsx` |
| Mention user search | `modules/messages/actions/mentions.ts:searchMentionUsers` |
| Tags browser | `app/(protected)/dashboard/tags/[slug]/page.tsx` |
| Related threads | `components/panels/RelatedThreadsCard.tsx` |

### Community Management

| Feature | Implementation |
|---------|---------------|
| Create thread | `modules/threads/actions.ts:createThreadAction` |
| Thread view (public/flat) | `app/thread/[slug]/page.tsx` |

### Email

| Feature | Implementation |
|---------|---------------|
| OTP email | `lib/services/email.ts:sendOTPEmail` |
| Welcome email | `lib/services/email.ts:sendWelcomeEmail` |
| Password reset email | `lib/services/email.ts:sendPasswordResetEmail` |
| Mention notification email | `lib/services/email.ts:sendMentionNotification` |
| Follow notification email | `lib/services/email.ts:sendFollowNotification` |
| Thread invitation email | `lib/services/email.ts:sendThreadInvitation` |
| Daily digest email | `lib/services/email.ts:sendNewsletterDigest` |

---

## AI Pipeline Architecture

### AI Search (User-facing)

```
User query (with own API keys from localStorage)
↓
POST /api/ai/forum-search
↓
Phase 1: Query classification (Gemini Flash)
→ type: factual | opinion | technical | comparison
→ suggestedSources, searchTerms[3], isControversial
↓
Phase 2: Parallel search (Promise.allSettled)
→ Exa: neural search for forum/technical content
→ Tavily: general web + news
↓
Phase 3: Cross-reference + conflict detection (Gemini Flash)
→ Tier assignment (T1=official docs, T2=SO/HN, T3=Reddit, T4=blogs)
→ Freshness check (isOutdated if >2 years)
→ Conflict detection prompt
↓
Phase 4: Synthesis (Gemini Pro)
→ Max 400 words, cite tier inline [official] [community]
→ Confidence score (0-100, factors: tier mix, agreement, freshness)
↓
Phase 5: Cache result (pgvector embedding + PostgreSQL)
→ TTL: technical=6h, opinion=1h, news=15min
↓
Stream response to client via ReadableStream
```

**Semantic cache:** Before Phase 1, embed query and cosine-check
pgvector. Similarity > 0.92 → serve cache instantly, skip all API calls.

**API keys:** User supplies own Exa, Tavily, Gemini keys.
Stored in localStorage only. Sent in request headers.
Never logged, never stored in DB.

### Thread Analysis Pipeline (Background Jobs)

```
Message posted
↓
├── 3rd message → generateThreadDNA (QStash)
│   → Gemini Flash → Thread.threadDna
│
├── 50+ messages → generateThreadSummary (QStash)
│   → LangChain map-reduce → Thread.aiSummary
│
├── 5+ messages → calculateResolutionScore (QStash)
│   → Gemini Flash + confidence decay → Thread.resolutionScore
│
├── New message → detectConflicts (QStash)
│   → Gemini Flash → Notification to subscribers
│
└── Daily cron → stalenessCheck (QStash)
    → Check Thread.updatedAt vs threshold → Thread.isOutdated
```

### LangChain Thread Summarization

```
All messages (up to 200)
↓
RecursiveCharacterTextSplitter (8K chunks, 500 overlap)
↓
Parallel map: summarize each chunk (Gemini Flash)
↓
Reduce: combine partial summaries (Gemini Flash)
↓
200-400 word comprehensive summary
↓
Fallback: basic 12K-char prompt if LangChain fails
```

---

## Real-time Architecture

This is a serverless, forum-style platform. There are no persistent WebSocket connections.

- **AI reply streaming**: GET endpoint at `/api/threads/[threadId]/ai-reply/stream` uses Server-Sent Events
- **Message updates**: Clients poll for new messages (not implemented yet - forum-style, no real-time needed)
- **Typing indicators**: Not implemented (forum-style platform)

Background jobs are processed via Upstash QStash webhooks and Vercel Cron.

---

## Security Rules

- All inputs validated with Zod before any processing
- All server actions return `{ data, error, ok, errorCode }`, never throw
- API keys (Exa, Tavily, Gemini) never logged, never stored in DB
- User content sanitized before passing to AI prompts
  (strip HTML, remove prompt injection patterns)
- Path traversal prevention on all file operations
- DB + Redis state updated atomically via Prisma $transaction
- AbortController + 15s timeout on every external API call
- withRetry(fn, 3, 300) exponential backoff on external APIs
- Promise.allSettled — one failed API never crashes full response
- Error boundaries at every route level
- Internal DB errors never leaked to client error messages
- Rate limiting on all AI endpoints (Upstash Redis)
- Per-user daily AI search quota (20/day)
- Thread visibility enforcement (PRIVATE/RESTRICTED membership checks)

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
