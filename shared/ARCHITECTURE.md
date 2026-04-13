```markdown
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

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes + Server Actions, Node.js
- **Database:** PostgreSQL via Prisma ORM (Neon serverless)
- **Real-time:** WebSockets (custom server + client in lib/infrastructure/websocket/)
- **Authentication:** Better Auth (email OTP + Google + GitHub)
- **Cache / Queue:** Upstash Redis + BullMQ
- **File Storage:** Vercel Blob Storage
- **AI — Search:** Exa API (forum/technical content), Tavily API (news/general web)
- **AI — Synthesis:** Google Gemini (Flash for classify/DNA/quick, Pro for synthesis)
- **AI — Embeddings:** Gemini embeddings + pgvector for semantic dedup
- **Email:** Resend
- **UI Components:** shadcn/ui
- **State Management:** TanStack Query

---

## System Architecture

```
Browser Client
  │
  ├── HTTP / Server Actions → Next.js App Router
  │                               │
  │                               ├── modules/ (domain logic)
  │                               │       │
  │                               │       ├── Prisma → PostgreSQL (Neon)
  │                               │       ├── Upstash Redis (cache + rate limit)
  │                               │       ├── BullMQ (AI job queue)
  │                               │       ├── Vercel Blob (file storage)
  │                               │       ├── Gemini / Exa / Tavily (AI)
  │                               │       └── Resend (email)
  │                               │
  │                               └── API Routes (REST endpoints)
  │
  └── WebSocket → lib/infrastructure/websocket/server.ts
                      │
                      └── modules/ (same domain layer)
```

---

## Directory Structure

```
├── app/
│   ├── (public)/               # Login, signup
│   ├── (protected)/            # Auth-gated routes
│   │   └── dashboard/          # Main app UI
│   │       ├── threads/        # Thread list + detail
│   │       ├── search/         # Local + AI search
│   │       ├── admin/          # Admin dashboard
│   │       ├── settings/       # User settings
│   │       └── notifications/  # Notifications page
│   └── api/
│       ├── ai/
│       │   ├── thread-summary/ # Generate thread AI summary
│       │   ├── forum-search/   # AI search pipeline (Exa+Tavily+Gemini)
│       │   └── jobs/           # Job status + cancel
│       ├── bootstrap/          # Single login round-trip endpoint
│       ├── cron/
│       │   ├── update-threads/ # Daily AI metadata refresh
│       │   └── daily-digest/   # Email digest trigger
│       ├── auth/               # Better Auth handlers
│       ├── newsletter/         # Newsletter endpoints
│       ├── threads/            # Thread REST endpoints
│       ├── upload/             # File upload
│       └── v1/moderation/      # Moderation API
│
├── components/
│   ├── ai-search/              # AI search page components
│   │   ├── SearchBox.tsx       # Query input + mode toggles + dropdowns
│   │   ├── Sidebar.tsx         # Collapsible sidebar + past searches
│   │   ├── PhaseTracker.tsx    # Pipeline progress (classify→done)
│   │   ├── SynthesisCard.tsx   # Streamed AI synthesis output
│   │   ├── SourceCard.tsx      # Individual source with tier + confidence
│   │   ├── TableView.tsx       # Comparison table mode
│   │   └── ApiKeysModal.tsx    # User-supplied API keys (localStorage only)
│   ├── thread/
│   │   ├── comment-tree.tsx    # Reddit-style nested reply tree ✅
│   │   ├── RightPanel.tsx      # Resolution score + DNA + AI summary
│   │   └── ...
│   ├── dashboard/
│   ├── admin/
│   ├── user/
│   └── ui/
│       └── TimeAgo.tsx         # Client-only relative time (no hydration issues)
│
├── modules/                    # Domain logic (actions + repository + service + types)
│   ├── auth/
│   ├── users/
│   ├── threads/
│   ├── messages/
│   ├── ai-search/              # Exa + Tavily + Gemini pipeline
│   ├── moderation/
│   ├── reports/
│   ├── appeals/
│   ├── newsletter/
│   ├── follows/
│   ├── bookmarks/
│   ├── tags/
│   ├── activity/
│   ├── reputation/
│   ├── badges/
│   ├── polls/
│   ├── invitations/
│   ├── notifications/
│   └── search/
│
├── lib/
│   ├── config/
│   ├── db/
│   ├── http/
│   ├── infrastructure/
│   │   ├── websocket/
│   │   │   ├── server.ts       # WebSocket server with auth ✅
│   │   │   └── client.ts       # WebSocket client ✅
│   │   ├── bullmq.ts           # All BullMQ job handlers ✅
│   │   └── logger.ts
│   ├── schemas/
│   │   └── prisma-json.ts      # Zod parsers for all Json Prisma fields
│   ├── security/
│   ├── services/
│   │   ├── auth.ts             # Better Auth config ✅
│   │   ├── ai.ts               # Gemini client
│   │   ├── exa.ts              # Exa client
│   │   ├── tavily.ts           # Tavily client
│   │   ├── email.ts            # Resend client
│   │   └── storage.ts          # Vercel Blob client
│   ├── types/                  # Shared domain types (single source of truth)
│   │   ├── thread.ts
│   │   ├── message.ts
│   │   ├── user.ts
│   │   ├── ai.ts
│   │   ├── jobs.ts
│   │   └── api.ts              # ApiResponse<T> envelope
│   └── utils/
│       ├── dedupe.ts           # In-flight request deduplication
│       └── retry.ts            # withRetry() for external API calls
│
├── stores/                     # TanStack Query + React context
├── prisma/
│   └── schema.prisma
└── shared/
    └── ARCHITECTURE.md         # This file
```

---

## Module Pattern

Every module follows this structure without exception:

```
modules/{feature}/
  actions.ts     — Server Actions (called from UI)
                   Always returns: { data: T | null, error: string | null }
                   Never throws. Always wraps in try/catch.
  repository.ts  — DB queries via Prisma. Typed returns, never any.
  service.ts     — Business logic, AI calls, cross-module orchestration
  types.ts       — Module-specific types (imports from lib/types/ for shared)
  index.ts       — Public exports
```

---

## Data Model — Key Entities

### Section (Thread)
The central entity. Stores AI metadata directly:
- `resolutionScore: Int?` — 0-100, calculated by BullMQ job
- `isOutdated: Boolean` — set by staleness detection cron
- `aiSummary: String?` — cached summary, regenerated on threshold
- `threadDna: Json?` — `{ questionType, expertiseLevel, topics[], readTimeMinutes, hasResolution }`
- `lastVerifiedAt: DateTime?` — when AI last checked sources

### Message
- `parentId: String?` — null = root post, enables tree structure
- `depth: Int` — 0=root, max 4 for visual nesting
- `isAiResponse: Boolean` — true for @ai inline responses
- `likeCount: Int` — denormalized, updated atomically
- `replyCount: Int` — denormalized, updated atomically
- `deletedAt: DateTime?` — soft delete, node preserved for tree integrity

### AiSearchSession + AiSearchResult
- Session tracks per-user query history
- Result stores synthesis shared across users via queryHash
- Semantic dedup via pgvector before hitting Exa/Tavily

### UserExpertise
- Per-domain expertise score (react, kubernetes, security, etc.)
- Auto-calculated from helpfulCount / totalCount ratio
- Displayed contextually — only when posting in matching domain

### ThreadRelation
- Semantic similarity between threads (0.0–1.0)
- Powers "Related Resolutions" sidebar
- Built by background pgvector similarity job

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

### Background AI Jobs (BullMQ)

All handlers exist in `lib/infrastructure/bullmq.ts`:

| Job | Trigger | Stores result in |
|-----|---------|-----------------|
| `handleGenerateThreadSummary` | 5+ messages or manual | Section.aiSummary |
| `handleCalculateResolutionScore` | 5+ messages or daily cron | Section.resolutionScore |
| `handleGenerateThreadDNA` | 3rd message posted | Section.threadDna |
| `handleDetectConflicts` | New message arrives | Section + Notification |
| `handleGenerateDailyDigest` | Daily cron | Email via Resend |
| `handleSendAIInsightNotifications` | Score change / outdated / conflict | Notification table |

Planned jobs (not yet implemented):
- `handleStalenesDetection` — daily re-check sources, set isOutdated
- `handleThreadRelationUpdate` — pgvector similarity between threads
- `handleConfidenceDecay` — degrade score based on topic velocity
- `handleBackgroundQueryWarming` — pre-warm cache from user's past searches

---

## Real-time Architecture

WebSocket server authenticated, scoped per thread.

**Event types (discriminated union in lib/types/api.ts):**
```typescript
type WebSocketEvent =
  | { type: 'message_created';          payload: MessageNode }
  | { type: 'message_deleted';          payload: { messageId: string } }
  | { type: 'message_edited';           payload: { messageId: string; content: string } }
  | { type: 'typing_start';             payload: { userId: string; userName: string } }
  | { type: 'typing_stop';              payload: { userId: string } }
  | { type: 'reaction_updated';         payload: { messageId: string; emoji: string; count: number } }
  | { type: 'ai_response_ready';        payload: MessageNode }
  | { type: 'resolution_score_updated'; payload: { threadId: string; score: number } }
  | { type: 'notification_created';     payload: { count: number } }
```

**Rule:** WebSocket events carry complete payloads.
They never trigger a refetch. If payload is incomplete, fix the payload.

---

## Performance Architecture

### Query Budget Per Page Load
```
Dashboard initial load:    ≤ 2 DB queries
Thread page load:          ≤ 1 DB query (full JOIN)
Navigation between pages:  0 DB queries (context)
WebSocket update:          0 DB queries (payload carries data)
AI search cache hit:       0 external API calls
AI search cache miss:      1 embed + 2 parallel calls + 1 write
```

### Bootstrap Endpoint
`GET /api/bootstrap` — called once on login, result in React context:
```typescript
{
  user: { id, name, avatarUrl, role, reputationPoints, isPro },
  unreadNotificationCount: number,
  recentActivity: UserActivity[5],
  reputation: { points, level },
  joinedCommunities: Community[]
}
```
Invalidated only when: badge earned, reputation changes >10pts, profile updated.

### Caching Hierarchy
```
Middleware (Redis session check, ~1ms)
  → Bootstrap context (zero DB reads on navigation)
    → Thread JOIN query (one round trip per thread)
      → WebSocket updates (zero DB reads)
        → Optimistic UI (zero wait on user actions)
```

---

## Security Rules

- All inputs validated with Zod before any processing
- All server actions return `{ data, error }`, never throw
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

---

## Type System Rules

Single source of truth: `lib/types/`
All layers (DB, API, UI) import from here — never redefine.

- All Prisma `Json` fields parsed through Zod in `lib/schemas/prisma-json.ts`
- All Gemini responses parsed through Zod before use
- All BullMQ job handlers typed with payload interface from `lib/types/jobs.ts`
- All WebSocket events use the discriminated union from `lib/types/api.ts`
- Zero `any` types permitted — use `unknown` and narrow with Zod

---

## Feature Status

### ✅ Implemented and Working
- Auth (email OTP + Google + GitHub + protected routes)
- Nested reply tree (Reddit-style, depth 4)
- Thread bookmarking
- Follow / unfollow users
- User status + role system
- Local search (threads, messages, users)
- Admin dashboard + moderation queue + reports + bans
- Email digest (cron + Resend)
- BullMQ AI job handlers (summary, score, DNA, conflicts, digest, notifications)
- AI search page (functional end-to-end)
- WebSocket server + client (exist, partially wired)

### 🟡 Partial (backend exists, UI not wired)
- RightPanel (resolution score + DNA + AI summary — data not connected)
- Rich text + attachments (backend exists, UI incomplete)
- Thread invitations (backend exists, UI missing)
- Thread access management (backend exists, UI missing)
- User profile edit (view exists, edit form missing)
- Avatar + banner upload (backend exists, UI missing)
- Notifications page (page exists, shows wrong component)
- WebSocket thread delivery (server exists, not wired to message list)

### ❌ Not Yet Built
- Message editing with history
- Message pinning
- Soft delete with placeholder
- @mentions with notifications
- Polls UI
- Thread tagging UI (manual + AI auto-display)
- Read receipts
- Profile privacy settings
- User preferences UI
- Unread notification count in header
- Mark as read (single + all)
- Per-thread subscription UI
- Typing indicators in thread UI
- Live notification count via WebSocket
- @ai inline in message input
- Semantic query cache (pgvector dedup)
- Staleness detection cron
- Confidence decay job
- Cross-thread knowledge links UI
- Expert Passport UI
- Thread merging suggestion
- Knowledge graph view
- Anonymous Expert Mode
- Virtual scrolling for long threads

---

## Deployment

- **Host:** Vercel (serverless)
- **Database:** Neon PostgreSQL (serverless)
- **Redis:** Upstash (serverless)
- **Storage:** Vercel Blob
- **CI/CD:** GitHub Actions → auto-deploy on main
```