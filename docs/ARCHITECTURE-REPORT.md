# Sastram Architecture Report

> **⚠️ Superseded by [docs/CANONICAL-REFERENCE.md](./CANONICAL-REFERENCE.md).**
> This document reflects a pre-refactor snapshot (June 2026). It is retained for
> historical context only. For verified, code-accurate facts see the canonical
> reference. Key differences from current state:
> - WebSocket layer (`modules/ws/`, `lib/infrastructure/websocket/`) was **removed**
> - `modules/chat/`, `modules/reputation/`, `modules/badges/` were **removed**
> - 4 quota services consolidated into `lib/services/daily-quota.ts`
> - `lib/services/blob.ts`, `lib/services/logger.ts`, `lib/dedupe.ts` were **removed**
> - `lib/actions/result.ts` (actionSuccess/actionFailure) and `lib/thread-access.ts` (visibilityFilter) were **added**
> - Current counts: 30 Prisma models, 35 API routes, 25 modules, 47 test files

**Date:** June 19, 2026 (snapshot); updated August 2026 (supersede notice)
**Status:** Superseded

---

## 1. Executive Summary

Sastram is an AI-powered community forum where questions get **resolved**, not just answered. It combines traditional forum features with a live knowledge resolution engine — AI searches across the web, synthesizes results, detects conflicts, and assigns confidence scores. Human community validates and challenges AI output. Knowledge compounds over time.

The backend is mature and well-architected. The frontend has significant gaps between what the backend supports and what the UI exposes.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.3.0 |
| Language | TypeScript (strict) | — |
| UI | React 19, Tailwind CSS 4, shadcn/ui | 19.2.8 |
| Database | PostgreSQL via Prisma ORM (Neon serverless) | 7.9.1 |
| Auth | Better Auth (email OTP + Google + GitHub OAuth) | 1.6.26 |
| Queue | QStash with Redis | — |
| Cache/Rate Limit | Upstash Redis | — |
| AI | Google Gemini (Flash + Pro), OpenAI GPT | — |
| AI Search | Exa API (neural), Tavily API (web) | — |
| File Storage | Vercel Blob | — |
| Monitoring | Sentry, Vercel Analytics | — |
| Email | Resend | — |
| Validation | Zod 4 | 4.4.3 |
| E2E Testing | Playwright | — |
| Unit Testing | Mocha + Chai + testing-library | — |

---

## 3. System Architecture

```
Browser Client
├── HTTP / Server Actions → Next.js App Router (Vercel Serverless)
│   ├── modules/ (25 domain modules: actions → repository → service → types)
│   ├── Prisma → PostgreSQL (Neon)
│   ├── Upstash Redis (cache + rate limit)
│   ├── QStash (AI job queue → /api/jobs webhook + inline fallback)
│   ├── Vercel Blob (file storage)
│   ├── Gemini / Exa / Tavily (AI)
│   └── Resend
│
├── SSE → app/api/threads/[threadId]/ai-reply/stream/route.ts
│   └── AI reply streaming (token/done/error events)
│
└── Cron Jobs → /api/cron/* (Vercel Cron)
    ├── Thread AI metadata refresh
    ├── Email digest
    ├── Blob cleanup
    └── Soft-delete purge
```

### Deployment Model

- **Vercel** hosts the Next.js serverless functions
- **No custom server** — the WebSocket server was removed; real-time is SSE-only
- **Jobs** run via QStash webhook to `/api/jobs` (or inline fallback when QStash is unconfigured)
- **Neon** provides serverless PostgreSQL with connection pooling
- **Upstash** provides Redis for caching, rate limiting, and QStash

---

## 4. Data Model

### 30 Prisma Models (current verified count)

**Core Content:**
| Model | Purpose | Key Fields |
|-------|---------|------------|
| User | User accounts | `role` (USER/MODERATOR/ADMIN), `status`, `deletedAt` (soft delete) |
| Thread | Discussion threads | `visibility` (PUBLIC/PRIVATE/RESTRICTED), `resolutionScore`, `threadDna` (JSON), `deletedAt` |
| Message | Thread messages | `parentId` (tree), `depth` (0-4), `isAiResponse`, `deletedAt` (soft delete), nullable `senderId` |
| MessageEdit | Edit history | Content snapshot per edit |
| MessageMention | @mentions | `messageId`, `userId` |
| Attachment | File attachments | Typed (IMAGE/GIF/VIDEO/FILE) |
| Reaction | Emoji reactions | Unique on `[messageId, userId, emoji]` |

**Access Control:**
| Model | Purpose |
|-------|---------|
| UserBan | Thread-scoped or site-wide bans with expiry |
| UserFollow | Social graph (self-referential) |
| ThreadInvitation | Token-based invites with expiry |

**Engagement:**
| Model | Purpose |
|-------|---------|
| Poll / PollVote | Thread polls |
| UserBookmark | Saved threads |
| ReadReceipt | Per-thread read tracking |
| ThreadSubscription | Email digest frequency (DAILY/WEEKLY/NEVER) |
| ThreadTag / ThreadTagRelation | Tagging system |

**Moderation:**
| Model | Purpose |
|-------|---------|
| ModerationRule | DB-driven regex content rules |
| Report | Content reports with typed categories |
| Appeal | Appeal pipeline (submitter → moderator review) |

**AI/Analytics:**
| Model | Purpose |
|-------|---------|
| UserActivity | Audit trail |
| AiSearchSession / AiSearchResult | AI search history + cached synthesis |
| AiUsageLog | Per-request token counts and cost estimates |
| ThreadRelation | Topic/type/expertise similarity (Jaccard index) |
| Notification | Typed notifications with JSON `data` payload |

---

## 5. Module Architecture

Every module follows a consistent pattern:

```
modules/{feature}/
├── actions.ts      ← Server Actions (called from UI)
│                     Returns { data, error, ok, errorCode }
│                     Never throws
├── repository.ts   ← DB queries via Prisma
├── service.ts      ← Business logic, AI calls, cross-module orchestration
├── types.ts        ← Module-specific types
├── schemas.ts      ← Zod validation schemas
├── index.ts        ← Public barrel exports
└── executors.ts    ← (optional) Orchestration for complex workflows
```

### 25 Domain Modules (current verified count)

| Category | Modules |
|----------|---------|
| Auth | `auth/`, `users/` |
| Content | `threads/`, `messages/` |
| Social | `follows/`, `bookmarks/`, `notifications/`, `invitations/` |
| Engagement | `polls/`, `tags/`, `activity/`, `reactions/`, `read-receipts/` |
| Moderation | `moderation/`, `reports/`, `appeals/` |
| AI | `ai-search/` |
| Automation | `newsletter/`, `search/`, `feedback/`, `policy/`, `audit/`, `topics/`, `members/` |

### Authorization Pattern

**All API routes and server actions must enforce thread access checks:**

1. `requireSession()` — Authentication only (does NOT check access)
2. `requireThreadAccessOrThrow(threadId, userId, role)` — Thread access guard (API routes)
3. `requireThreadWriteOrThrow(threadId, userId, role)` — Thread write guard (API routes)
4. `assertAdmin(session.user)` — Admin-only actions
5. `requireAdmin()` / `requireModerator()` — API route middleware

```typescript
// Correct pattern (every action):
const session = await requireSession();
await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
```

---

## 6. API Routes (35 Routes — current verified count)

### Authentication (6)
- `/api/auth/[...all]` — Better Auth catch-all
- `/api/sign-in/email-otp` — Email OTP sign-in
- `/api/email-otp/*` — Send/check/reset OTP
- `/api/forget-password/email-otp` — Password reset

### AI Features (7)
- `/api/ai/forum-search` — Full AI search pipeline (Exa + Tavily + Gemini)
- `/api/ai/thread-summary` — Generate AI thread summary
- `/api/ai/thread-dna` — Generate thread DNA analysis
- `/api/ai/resolution-score` — Calculate resolution score
- `/api/ai/search-history` — Get search history
- `/api/ai/spend` — Get AI spend usage (admin)
- `/api/threads/[threadId]/ai-reply` + `/ai-reply/stream` — AI reply (SSE streaming)

### Core Resources (5)
- `/api/threads` — Thread CRUD
- `/api/threads/similar` — Similar thread lookup
- `/api/messages` — Message CRUD
- `/api/search` — Local search
- `/api/upload` — File upload (Vercel Blob)

### Cron / Scheduled (3)
- `/api/cron/update-threads` — Batch AI metadata refresh
- `/api/cron/daily-digest` — Email digest trigger
- `/api/cron/cleanup-blobs` — Blob cleanup

### Admin / Moderation (7)
- `/api/admin/health` — Admin health check
- `/api/admin/sla` — Moderation SLA stats
- `/api/v1/moderation/*` — Moderation rules, queue, appeals, stats

### Other (7)
- `/api/health` — Health check
- `/api/bootstrap` — Initial app state for React context
- `/api/newsletter/generate` — Newsletter generation
- `/api/jobs` — QStash webhook callback (background jobs)
- `/api/csp-report` — CSP violation collector
- `/api/invitations/accept` — Accept thread invitation

---

## 7. AI Architecture

### AI Service (`lib/services/ai.ts`)

Factory pattern with provider abstraction:

| Method | Purpose | Provider |
|--------|---------|----------|
| `generateSummary()` | Quick content summary | Gemini Flash |
| `generateThreadSummary()` | Thread-level summary | Gemini Flash |
| `generateThreadDNA()` | Metadata analysis | Gemini Flash |
| `calculateResolutionScore()` | 0–100 confidence score | Gemini Flash |
| `detectConflicts()` | Contradiction detection | Gemini Flash |
| `generateDailyDigest()` | HTML email digest | Gemini Pro |
| `generateStreamingResponse()` | Real-time token streaming | Gemini Flash / OpenAI |

**Robustness patterns:**
- `withRetry(fn, 3, 300, 15000)` — Exponential backoff on all external calls
- `AbortController` with 15s timeout per call (streaming uses 30s stall-based timeout)
- Zod validation on all AI outputs with fallback defaults
- Content capped at 12,000 characters to control token usage
- `cleanJsonText()` strips markdown fences before JSON parsing

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

### QStash Background Jobs

| Job | Trigger | Stores Result In |
|-----|---------|-----------------|
| `thread-summary` | 5+ messages or manual | Thread.aiSummary |
| `thread-dna` | 3rd message posted | Thread.threadDna |
| `resolution-score` | 5+ messages or daily cron | Thread.resolutionScore |
| `conflict-detection` | New message arrives | Thread.isOutdated + Notification |
| `daily-digest` | Daily cron | Email via Resend |
| `ai-insight-notifications` | Score change / outdated / conflict | Notification |
| `ai-inline` | @sai mention in message | Message (streamed via SSE) |
| `staleness-check` | Daily cron | Thread.isOutdated |
| `email` | Various | Email delivery |

### @sai Inline Response Flow

```
User posts "@sai How do I fix X?"
│
├─ Message saved to DB
├─ Side effects adapter detects @sai mention
├─ QStash job enqueued (ai-inline)
│
├─ Worker picks up job:
│  1. Fetch thread context (last 8 messages)
│  2. Get/create AI user (ai@sastram.system)
│  3. Create empty AI message in DB
│  4. Stream AI response via SSE
│  5. Final emit (isComplete: true)
│
└─ Client receives streaming tokens → renders incrementally
```

---

## 8. Real-time Architecture (Current State)

### SSE for AI Streaming

- `app/api/threads/[threadId]/ai-reply/stream/route.ts` — Active SSE endpoint for AI reply streaming
- Events: `token`, `done`, `error`
- Client uses `hooks/useAIReplyStream.ts` (not WebSocket)

### Redis Pub/Sub (Publish-Only)

- `lib/infrastructure/redis.ts:84-108` — `publishUserEvent` emits `NOTIFICATION_COUNT_UPDATE` on `user:{id}`
- No subscriber exists; used for potential future cross-instance notification delivery

### Removed: WebSocket Layer

The following were **removed** during the architecture refactor:
- `modules/ws/` — entire module deleted
- `lib/infrastructure/websocket/server.ts` — never existed as functional code
- `hooks/useThreadWebSocket.ts` — deleted
- `hooks/chat/use-websocket.ts` — deleted
- All `emit*` functions — deleted

Non-AI updates rely on client polling (20s normal, 3s during @sai pending).

---

## 9. Security Architecture

### Authentication
- Better Auth with email OTP + OAuth (Google, GitHub)
- Session cookie: `better-auth.session_token`
- CRON_SECRET: Bearer token with min 32 characters

### Authorization
- **Thread access model** is the primary authorization primitive (no membership table)
- `lib/thread-access.ts` — `requireThreadAccessOrThrow`, `requireThreadWriteOrThrow`, `canAccessThread`, `canManageThread`, `visibilityFilter`
- Visibility rule: creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN
- Admin-only: `assertAdmin()` / `requireAdmin()` / `requireModerator()`

### Input Validation
- Zod validation at every boundary (env, API, actions, AI)
- Content sanitization via `sanitize-html` (XSS prevention)
- Prompt injection protection via `sanitizeSearchQuery()`
- File upload: size limits (4.5MB), type whitelist, thread access check on upload

### Rate Limiting
- Upstash Redis with sliding window
- In-memory fallback when Redis unavailable
- Buckets: auth(5/15min), api(100/min), upload(10/hr), message(20/min)

### Security Headers (proxy.ts)
- `Content-Security-Policy` — per-request nonce-based (Report-Only by default)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (HSTS)
- `Permissions-Policy` (no camera/mic/geo)

### Secrets Management
- User API keys (Exa, Tavily, Gemini) stored in localStorage only
- Never logged, never stored in DB
- `BETTER_AUTH_SECRET` min 32 chars enforced by Zod

---

## 10. Test Coverage

### Unit Tests (47 files, 297+ tests passing)

| Area | Coverage |
|------|----------|
| API response helpers | ✅ Full |
| Content safety (XSS) | ✅ Full |
| Error handling | ✅ Full |
| Queue config | ✅ Full |
| FTS search schemas | ✅ Full |
| Utility functions | ✅ Full |
| Moderation regex | ✅ Full |
| Rate limiting | ✅ Partial |
| Component rendering | ✅ Full |
| QStash job handlers | ✅ Input validation |
| AI cost classification | ✅ Full |
| Thread access | ✅ Full |

### E2E Tests
- `auth-create-thread-reply.spec.ts` — Auth + thread creation + reply
- `ai-search.spec.ts` — AI search flow

### CI Pipeline (GitHub Actions)
```
PostgreSQL 16 service container
→ pnpm install
→ prisma migrate
→ tsc --noEmit
→ eslint
→ mocha tests
```

---

## 11. Issues & Gaps

### Critical Issues

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 1 | **No real-time delivery layer** — WebSocket removed; non-AI updates are poll-only | Real-time broken at scale | Known limitation |
| 2 | **No Content-Security-Policy nonce on Next.js bootstrap script** | XSS risk under enforcing CSP | Report-Only mode; pending review |
| 3 | **No CSRF token validation** on server actions | Security | Mitigated by proxy.ts origin check |
| 4 | **AI classifier fragility** — prompt changes could break classification | Reliability | Not addressed |

### Architecture Gaps

| # | Gap | Current State | Recommendation |
|---|-----|---------------|----------------|
| 1 | **State management** — Fragmented across React useState/useContext | Fragmented | Consolidate critical state |
| 2 | **Error boundaries** — Only at route level | Route-level only | Add per-component boundaries |
| 3 | **Optimistic updates** — No optimistic UI for message posting | None | Add optimistic updates |
| 4 | **Message pagination** — Messages loaded all at once | Full load | Implement cursor pagination |
| 5 | **File upload validation** — MIME type validation relies on client-provided Content-Type | Client-only | Add server-side MIME verification |
| 6 | **Internationalization** — All strings hardcoded in English | English only | Add i18n framework |
| 7 | **Accessibility** — No ARIA labels on most interactive elements | Minimal | Audit and add ARIA attributes |

---

## 12. Performance Characteristics

### Query Budget Per Page Load

```
Dashboard initial load:    ≤ 2 DB queries
Thread page load:          ≤ 1 DB query (full JOIN)
Navigation between pages:  0 DB queries (context)
AI search cache hit:       0 external API calls (exact normalized-query SHA-256 match)
AI search cache miss:      2 parallel calls (classify + cross-reference) + 1 synthesize + 1 write
```

### Caching Hierarchy

```
Middleware (Redis session check, ~1ms)
  → Bootstrap context (zero DB reads on navigation)
    → Thread JOIN query (one round trip per thread)
      → Client polling (20s normal, 3s during @sai pending)
```

---

## 13. Recommendations

### Immediate (Pre-Launch)

1. **Add Content-Security-Policy nonce on Next.js bootstrap script** — or keep Report-Only
2. **Wire E2E tests into CI** — Playwright tests should run on every PR
3. **Add `pnpm build` to CI** — Catch build errors before merge
4. **Add optimistic updates** — Message posting, reactions, pins

### Short-Term (1-2 months)

5. **Add API integration tests** — Test critical routes with actual HTTP requests
6. **Implement message pagination** — Cursor-based for long threads
7. **Add typing indicators to thread UI** — Backend exists, UI missing
8. **Build @sai inline trigger UI** — Make it easy for users to invoke AI

### Medium-Term (3-6 months)

9. **Add i18n** — Internationalization framework
10. **Performance monitoring** — Lighthouse CI, Web Vitals, custom metrics
11. **Accessibility audit** — ARIA labels, keyboard navigation, screen reader testing

---

## 14. Conclusion

Sastram has a solid backend foundation with well-structured modules, comprehensive validation, and a sophisticated AI pipeline. The primary risks are:

1. **No real-time delivery** — WebSocket removed; non-AI updates depend on polling
2. **Frontend gaps** — Multiple features have backend support but no UI
3. **Test coverage** — No integration tests, E2E not in CI
4. **Security** — CSP not yet enforcing, no security scanning

The architecture is clean and extensible. The module pattern is consistent and well-documented. The AI pipeline is robust with proper retry, timeout, and fallback mechanisms. The main work ahead is filling in the frontend gaps and hardening the deployment pipeline.
