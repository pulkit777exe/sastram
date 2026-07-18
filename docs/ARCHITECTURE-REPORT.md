# Sastram Architecture Report

**Date:** June 19, 2026
**Status:** Pre-production
**Codebase:** ~30 domain modules, 27 Prisma models, 31 API routes, 9 QStash job types

---

## 1. Executive Summary

Sastram is an AI-powered community forum where questions get **resolved**, not just answered. It combines traditional forum features with a live knowledge resolution engine — AI searches across the web, synthesizes results, detects conflicts, and assigns confidence scores. Human community validates and challenges AI output. Knowledge compounds over time.

The backend is mature and well-architected. The frontend has significant gaps between what the backend supports and what the UI exposes. The primary risks are around WebSocket scalability, test coverage, and the ~28 unbuilt frontend features.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.9 |
| Language | TypeScript (strict) | — |
| UI | React 19, Tailwind CSS 4, shadcn/ui | 19.2.7 |
| Database | PostgreSQL via Prisma ORM (Neon serverless) | 7.8.0 |
| Auth | Better Auth (email OTP + Google + GitHub OAuth) | 1.6.19 |
| Real-time | Custom WebSocket server (ws library) | 8.21.0 |
| Queue | QStash with Redis | 5.78.1 |
| Cache/Rate Limit | Upstash Redis + ioredis | — |
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
│   ├── modules/ (30 domain modules: actions → repository → service → types)
│   ├── Prisma → PostgreSQL (Neon)
│   ├── Upstash Redis (cache + rate limit)
│   ├── QStash (AI job queue → /api/jobs webhook + inline fallback)
│   ├── Vercel Blob (file storage)
│   ├── Gemini / Exa / Tavily (AI)
│   └── Resend
│
├── WebSocket → lib/infrastructure/websocket/server.ts (custom Node.js server)
│   └── Redis pub/sub (cross-instance relay)
│
└── Cron Jobs → /api/cron/* (GitHub Actions or Vercel Cron)
    ├── Thread AI metadata refresh
    ├── Email digest
    ├── Staleness detection
    └── Worker health check
```

### Deployment Model

- **Vercel** hosts the Next.js serverless functions
- **Custom server** (`server.ts`) starts the WebSocket server alongside Next.js
- **Jobs** run via QStash webhook to `/api/jobs` (or inline fallback when QStash is unconfigured)
- **Neon** provides serverless PostgreSQL with connection pooling
- **Upstash** provides Redis for caching, rate limiting, and QStash

---

## 4. Data Model

### 27 Prisma Models

**Core Content:**
| Model | Purpose | Key Fields |
|-------|---------|------------|
| User | User accounts | `preferences` (JSON), `reputationPoints`, `followerCount`, `isPro`, `status`, `role` |
| Community | Top-level groups | `visibility` (PUBLIC/PRIVATE/UNLISTED), `settings` (JSON) |
| Thread | Discussion threads | `resolutionScore`, `aiSummary`, `threadDna` (JSON), `isOutdated` |
| Message | Thread messages | `parentId` (tree), `depth` (0-4), `isAiResponse`, `deletedAt` (soft delete), denormalized `likeCount`/`replyCount` |
| MessageEdit | Edit history | Content snapshot per edit |
| Attachment | File attachments | Typed (IMAGE/GIF/VIDEO/FILE) |
| Reaction | Emoji reactions | Unique on `[messageId, userId, emoji]` |

**Access Control:**
| Model | Purpose |
|-------|---------|
| ThreadMember | Thread membership with roles (OWNER/MODERATOR/MEMBER) |
| UserBan | Thread-scoped or site-wide bans with expiry |
| UserFollow | Social graph (self-referential) |

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
| UserReputation | Points + level |
| UserBadge / UserBadgeEarned | Gamification |
| UserActivity | Audit trail |
| AiSearchSession / AiSearchResult | AI search history + cached synthesis |
| ThreadRelation | Topic/type/expertise similarity (Jaccard index in app code, `modules/threads/threads-relations/repository.ts`, 0.0–1.0). NOT pgvector. |
| ThreadInvitation | Token-based invites with expiry |
| Notification | Typed notifications with JSON `data` payload |

### Indexing Strategy

Extensive composite indexes for performance:
- `Message`: `[threadId, createdAt]`, `[parentId, threadId]`, `[depth]`
- `Thread`: `[resolutionScore]`, `[communityId]`, `[createdBy]`
- `User`: `[email]`, `[status]`, `[lastSeenAt]`
- `ReadReceipt`: `[threadId, userId]` (unique) + `[readAt]`
- `Notification`: `[userId, isRead]` + `[createdAt]`

---

## 5. Module Architecture

Every module follows a consistent pattern:

```
modules/{feature}/
├── actions.ts      ← Server Actions (called from UI)
│                     Always returns { data, error, ok, errorCode }
│                     Never throws
├── repository.ts   ← DB queries via Prisma
│                     Typed returns, never `any`
├── service.ts      ← Business logic, AI calls, cross-module orchestration
├── types.ts        ← Module-specific types
├── schemas.ts      ← Zod validation schemas
├── index.ts        ← Public barrel exports
└── executors.ts    ← (optional) Orchestration for complex workflows
```

### 30 Domain Modules

| Category | Modules |
|----------|---------|
| Auth | `auth/`, `users/` |
| Content | `threads/`, `messages/`, `chat/` |
| Social | `follows/`, `bookmarks/`, `notifications/`, `invitations/` |
| Engagement | `polls/`, `tags/`, `reputation/`, `badges/`, `activity/` |
| Moderation | `moderation/`, `reports/`, `appeals/` |
| AI | `ai-search/`, `ws/` (WebSocket publisher) |
| Automation | `newsletter/`, `read-receipts/`, `search/` |

### Authorization Pattern

**All API routes and server actions must enforce membership checks:**

1. `requireSession()` — Authentication only (does NOT check membership)
2. `getMemberRole(threadId, userId)` — Returns role or null
3. `assertAdmin(session.user)` — Admin-only actions
4. `requireAdmin()` / `requireModerator()` — API route middleware

```typescript
// Correct pattern (every action):
const session = await requireSession();
const role = await getMemberRole(threadId, session.user.id);
if (!role) return fail('AUTHORIZATION_ERROR', 'Not a member');
```

---

## 6. API Routes (31 Routes)

### Authentication (6)
- `/api/auth/[...all]` — Better Auth catch-all
- `/api/sign-in/email-otp` — Email OTP sign-in
- `/api/email-otp/*` — Send/check/reset OTP
- `/api/forget-password/email-otp` — Password reset

### AI Features (6)
- `/api/ai/forum-search` — Full AI search pipeline (Exa + Tavily + Gemini)
- `/api/ai/thread-summary` — Generate AI thread summary
- `/api/ai/thread-dna` — Generate thread DNA analysis
- `/api/ai/resolution-score` — Calculate resolution score
- `/api/jobs` — QStash webhook callback (background jobs)
- `/api/threads/[threadId]/ai-reply` — @sai inline response

### Core Resources (5)
- `/api/threads` — Thread CRUD
- `/api/messages` — Message CRUD
- `/api/conversations` — Chat conversations
- `/api/search` — Local search
- `/api/upload` — File upload (Vercel Blob)

### Cron / Scheduled (3)
- `/api/cron/update-threads` — Batch AI metadata refresh
- `/api/cron/daily-digest` — Email digest trigger
- `/api/cron/worker` — Worker health check

### Admin / Moderation (6)
- `/api/admin/health` — Admin health check
- `/api/v1/moderation/*` — Moderation rules, queue, appeals, stats

### Other (5)
- `/api/health` — Health check
- `/api/bootstrap` — Initial app state for React context
- `/api/newsletter/generate` — Newsletter generation
- `/api/docs` — API documentation (Swagger UI)

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

**Source tiering:**
- T1: Official docs (MDN, React, Python, etc.)
- T2: StackOverflow, HN, GitHub
- T3: Reddit, Quora
- T4: Everything else

### QStash Background Jobs (9 queue types)

| Job | Trigger | Stores Result In |
|-----|---------|-----------------|
| `thread-summary` | 5+ messages or manual | Thread.aiSummary |
| `thread-dna` | 3rd message posted | Thread.threadDna |
| `resolution-score` | 5+ messages or daily cron | Thread.resolutionScore |
| `conflict-detection` | New message arrives | Thread.isOutdated + Notification |
| `daily-digest` | Daily cron | Email via Resend |
| `ai-insight-notifications` | Score change / outdated / conflict | Notification |
| `ai-inline` | @sai mention in message | Message (streamed via QStash job) |
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
│  4. Emit placeholder via WebSocket (isComplete: false)
│  5. Stream AI response:
│     - Each chunk → update DB (throttled 500ms)
│     - Each chunk → emit via WebSocket (throttled 100ms)
│  6. Final emit (isComplete: true)
│
└─ Client receives streaming tokens → renders incrementally
```

---

## 8. Real-time Architecture

### WebSocket Server (`lib/infrastructure/websocket/server.ts`)

554-line production WebSocket server with:

- **Authentication**: Cookie-based session validation during upgrade handshake
- **Thread scoping**: Connections scoped to `/ws/thread/{threadId}`
- **Notification channel**: `/ws/notifications` for user-specific events
- **Membership verification**: Private/restricted threads checked at connection
- **Per-user connection limit**: Max 10 connections per user
- **Typing indicators**: 3-second timeout with automatic cleanup
- **Heartbeat**: 30-second ping/pong with dead connection termination
- **Redis pub/sub**: Cross-instance message forwarding
- **Loopback prevention**: `sourceInstance` ID prevents duplicate delivery
- **Rate limiting**: Per-user WebSocket message rate limiting

### Event Types (Discriminated Union)

```typescript
type WebSocketEvent =
  | { type: 'NEW_MESSAGE';           payload: MessagePayload }
  | { type: 'MESSAGE_DELETED';       payload: { messageId: string } }
  | { type: 'REACTION_UPDATE';       payload: { messageId, reactionType, count } }
  | { type: 'PIN_UPDATE';            payload: { messageId, isPinned } }
  | { type: 'USER_TYPING';           payload: { userId, userName } }
  | { type: 'USER_STOPPED_TYPING';   payload: { userId } }
  | { type: 'MENTION_NOTIFICATION';  payload: { ... } }
  | { type: 'ERROR';                 payload: { error, details? } }
```

### Client Hook (`hooks/useThreadWebSocket.ts`)

- Validates all incoming messages against Zod schemas
- Stores callbacks in refs to prevent reconnection on re-render
- Handles typing indicators with auto-expiry timers
- Tracks AI streaming status

### Redis Pub/Sub (`lib/infrastructure/redis-pubsub.ts`)

- Separate Redis pub and sub connections
- Thread channels (`thread:{id}`) and user channels (`user:{id}`)
- Lazy subscription with reference counting
- Cross-instance relay for multi-server deployments

### Message Flow

```
Publisher (any source)
  → publishThreadEvent(threadId, event)
  → Redis PUBLISH thread:{threadId}
  → WS Server Redis SUBSCRIBER receives
  → Forwards to all local WebSocket clients subscribed to that thread
  → Client validates with Zod → dispatches to handler
```

---

## 9. Security Architecture

### Authentication
- Better Auth with email OTP + OAuth (Google, GitHub)
- Session cookie: `better-auth.session_token`
- WebSocket auth: Cookie read during HTTP upgrade handshake
- CRON_SECRET: Bearer token with min 32 characters

### Authorization
- Thread membership is the primary authorization primitive
- Roles: OWNER > MODERATOR > MEMBER
- Admin-only actions via `assertAdmin()` / `requireAdmin()`
- Private/restricted threads verified at WS connection time

### Input Validation
- Zod validation at every boundary (env, API, actions, WS, AI)
- Content sanitization via `sanitize-html` (XSS prevention)
- Prompt injection protection via `sanitizeSearchQuery()`
- File upload: size limits (4.5MB), type whitelist

### Rate Limiting
- Upstash Redis with sliding window
- In-memory fallback when Redis unavailable
- Buckets: auth(5/15min), api(100/min), upload(10/hr), websocket(50/min), message(20/min)

### Security Headers (next.config.ts)
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (no camera/mic/geo)

### Secrets Management
- User API keys (Exa, Tavily, Gemini) stored in localStorage only
- Never logged, never stored in DB
- Sent in request headers over HTTPS
- `BETTER_AUTH_SECRET` min 32 chars enforced by Zod

---

## 10. Test Coverage

### Unit Tests (23 files, 230+ tests passing)

| Area | Coverage |
|------|----------|
| API response helpers | ✅ Full |
| Content safety (XSS) | ✅ Full |
| Error handling | ✅ Full |
| Logger | ✅ Full |
| Queue config | ✅ Full |
| FTS search schemas | ✅ Full |
| Utility functions | ✅ Full |
| WebSocket cross-instance | ✅ Full |
| Moderation regex | ✅ Full |
| Rate limiting | ⚠️ Partial (1 timeout failure) |
| Redis Upstash | ⚠️ Partial (env-dependent) |
| Component rendering | ✅ Full (ErrorBoundary, OtpInput, CommentTree, ThreadLiveWrapper) |
| QStash job handlers | ✅ Input validation only |

### E2E Tests (3 specs)
- `auth-create-thread-reply.spec.ts` — Auth + thread creation + reply
- `ai-search.spec.ts` — AI search flow
- `websocket.spec.ts` — WebSocket connection

### CI Pipeline (GitHub Actions)
```
PostgreSQL 16 service container
→ pnpm install
→ prisma migrate
→ tsc --noEmit
→ eslint
→ mocha tests
```

### Test Gaps

| Gap | Risk | Recommendation |
|-----|------|----------------|
| No API integration tests (HTTP requests) | High | Add supertest-based tests for critical routes |
| No database integration tests | High | Add Prisma test transactions |
| No QStash worker integration tests | Medium | Add test containers with Redis |
| No WebSocket server integration tests | Medium | Add ws client tests |
| E2E not run in CI | High | Add Playwright to CI pipeline |
| No build verification in CI | Medium | Add `pnpm build` step |
| No security scanning | Medium | Add CodeQL or Snyk |

---

## 11. Issues & Gaps

### Critical Issues

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 1 | **WebSocket in-memory state** — Thread channels, connections, and typing indicators stored in `Map` objects. Multiple server instances cannot communicate. | Real-time broken at scale | Documented, not fixed |
| 2 | **No Content-Security-Policy header** — Missing from security headers in `next.config.ts`. XSS risk if any sanitization is bypassed. | Security | Not implemented |
| 3 | **No CSRF token validation** on server actions — Relies on Next.js built-in SameSite cookie protections. | Security | Acceptable for current scope |
| 4 | **`moderation.ts` FK violation** — `bannedBy: 'system'` is a string, not a valid User ID. Would fail foreign key constraint on `UserBan` creation. | Data integrity | Not fixed |
| 5 | **AI classifier fragility** — `MLClassifier.analyze()` uses `aiService.generateSummary()` for toxicity analysis. Creative but fragile — prompt changes could break classification. | Reliability | Not addressed |

### Architecture Gaps

| # | Gap | Current State | Recommendation |
|---|-----|---------------|----------------|
| 1 | **WebSocket client** — No reconnection, no heartbeat handling, no message buffering, no offline queue. | Raw WebSocket only | Add reconnection with exponential backoff |
| 2 | **State management** — Only 1 Zustand store (`thread-view-store.ts`) despite being listed as the state management solution. Most state is in React useState/useContext. | Fragmented | Consolidate critical state into Zustand or TanStack Query |
| 3 | **Error boundaries** — Only at route level. No per-component error boundaries for granular error recovery. | Route-level only | Add error boundaries around critical sections |
| 4 | **Optimistic updates** — No optimistic UI for message posting, reactions, or pins. Every action waits for server response. | None | Add optimistic updates for better UX |
| 5 | **Message pagination** — Thread messages loaded all at once. No cursor-based pagination for long threads. | Full load | Implement cursor pagination |
| 6 | **File upload validation** — Size check exists but MIME type validation relies on client-provided Content-Type. Server-side magic byte checking missing. | Client-only | Add server-side MIME verification |
| 7 | **Email templates** — Plain text only. No HTML email templates for digests, mentions, or notifications. | Plain text | Build responsive HTML templates |
| 8 | **Internationalization** — All strings hardcoded in English. No i18n framework. | English only | Add next-intl or similar |
| 9 | **Accessibility** — No ARIA labels on most interactive elements. No keyboard navigation testing. No screen reader testing. | Minimal | Audit and add ARIA attributes |
| 10 | **Performance monitoring** — No Lighthouse CI, no Web Vitals tracking, no custom performance metrics. | None | Add Vercel Speed Insights or custom |

### Missing Frontend Features (28 items from ARCHITECTURE.md)

**High Priority (core UX):**
- Message editing with history UI
- @mentions with notifications UI
- Polls UI (backend exists)
- Thread tagging UI (backend exists)
- Typing indicators in thread UI
- @sai inline in message input (trigger UI)
- Live notification count via WebSocket
- Unread notification count in header
- Mark as read (single + all)

**Medium Priority (engagement):**
- Read receipts
- Profile privacy settings
- User preferences UI
- Per-thread subscription UI
- Thread invitations UI (backend exists)
- Thread access management UI (backend exists)
- User profile edit form (view exists)
- Avatar + banner upload UI (backend exists)

**Low Priority (advanced):**
- Semantic query cache (pgvector dedup) — NOT BUILT. Current AI-search caching is an
  exact normalized-query SHA-256 hash cache (modules/ai-search/cache.ts), which cuts
  repeat-query cost but provides no semantic/embedding similarity.
- Cross-thread knowledge links UI
- Expert Passport UI
- Thread merging suggestion
- Knowledge graph view
- Anonymous Expert Mode
- Virtual scrolling for long threads
- RightPanel data connection (resolution score + DNA + AI summary)

### Partially Implemented Features

| Feature | Backend | Frontend | Gap |
|---------|---------|----------|-----|
| RightPanel | ✅ Resolution score + DNA + summary | ❌ Not connected | Data fetching + rendering |
| Rich text + attachments | ✅ Upload + storage | ⚠️ Basic | No rich text editor, limited preview |
| Thread invitations | ✅ Token + expiry | ❌ No UI | Invite form + acceptance flow |
| Thread access management | ✅ Member roles | ❌ No UI | Member list + role management |
| User profile | ✅ Full CRUD | ⚠️ View only | Edit form missing |
| Avatar + banner | ✅ Vercel Blob upload | ❌ No UI | Upload component |
| Notifications | ✅ Full system | ⚠️ Wrong component | Page shows incorrect content |
| WebSocket thread delivery | ✅ Server + Redis | ⚠️ Partially wired | Not all events connected |

---

## 12. Performance Characteristics

### Query Budget Per Page Load

```
Dashboard initial load:    ≤ 2 DB queries
Thread page load:          ≤ 1 DB query (full JOIN)
Navigation between pages:  0 DB queries (context)
WebSocket update:          0 DB queries (payload carries data)
AI search cache hit:       0 external API calls (exact normalized-query SHA-256 match, see modules/ai-search/cache.ts)
AI search cache miss:      2 parallel calls (classify + cross-reference) + 1 synthesize + 1 write
                         NOTE: the cache is query-hash based — there is NO embedding step and NO pgvector.
                         A "semantic" / pgvector similarity cache does NOT exist (see Low Priority list below).
```

### Caching Hierarchy

```
Middleware (Redis session check, ~1ms)
  → Bootstrap context (zero DB reads on navigation)
    → Thread JOIN query (one round trip per thread)
      → WebSocket updates (zero DB reads)
        → Optimistic UI (zero wait on user actions)
```

### Known Performance Issues

1. **Thread messages loaded all at once** — No pagination. Threads with 1000+ messages will have slow initial loads.
2. **Virtual scrolling exists but is not wired** — `useVirtualizer` is set up in `MessageList` but may not be handling dynamic heights correctly.
3. **AI streaming throttled to 100ms** — Could be more aggressive (50ms) for better perceived performance.
4. **No image lazy loading** — All images loaded eagerly.
5. **No code splitting** — All thread components loaded together.

---

## 13. Recommendations

### Immediate (Pre-Launch)

1. **Fix the `bannedBy: 'system'` FK violation** — Use a system user ID or make the field nullable.
2. **Add Content-Security-Policy header** — At minimum, restrict script-src and style-src.
3. **Wire E2E tests into CI** — Playwright tests should run on every PR.
4. **Add `pnpm build` to CI** — Catch build errors before merge.
5. **Fix the notifications page** — Currently shows wrong component.
6. **Add WebSocket reconnection** — Critical for reliability on flaky connections.

### Short-Term (1-2 months)

7. **Add API integration tests** — Test critical routes with actual HTTP requests.
8. **Implement message pagination** — Cursor-based for long threads.
9. **Add optimistic updates** — Message posting, reactions, pins.
10. **Wire RightPanel** — Connect resolution score + DNA + AI summary to the UI.
11. **Add typing indicators to thread UI** — Backend exists, UI missing.
12. **Build @sai inline trigger UI** — Make it easy for users to invoke AI.

### Medium-Term (3-6 months)

13. **Migrate WebSocket state to Redis** — Enable multi-instance deployment.
14. **Add CSP + security scanning** — CodeQL or Snyk in CI.
15. **Build email templates** — HTML digests, mention notifications.
16. **Add i18n** — Internationalization framework.
17. **Performance monitoring** — Lighthouse CI, Web Vitals, custom metrics.
18. **Accessibility audit** — ARIA labels, keyboard navigation, screen reader testing.

---

## 14. Conclusion

Sastram has a solid backend foundation with well-structured modules, comprehensive validation, and a sophisticated AI pipeline. The primary risks are:

1. **WebSocket scalability** — In-memory state limits to single-instance deployment
2. **Frontend gaps** — ~28 features have backend support but no UI
3. **Test coverage** — No integration tests, E2E not in CI
4. **Security** — Missing CSP header, no security scanning

The architecture is clean and extensible. The module pattern is consistent and well-documented. The AI pipeline is robust with proper retry, timeout, and fallback mechanisms. The main work ahead is filling in the frontend gaps and hardening the deployment pipeline.
