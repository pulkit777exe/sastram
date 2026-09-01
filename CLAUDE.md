# Sastram — Discussion and Research Platform

Personal project, open sourced. Built with Next.js, Prisma, and AI.

## Overview

Next.js 16+ Discussion and Research Platform with TypeScript, Prisma ORM, PostgreSQL (Neon), serverless architecture, Better Auth authentication, and AI integration.

For the verified system reference, see [shared/ARCHITECTURE.md](shared/ARCHITECTURE.md) (canonical) and [docs/ARCHITECTURE-REVIEW.md](docs/ARCHITECTURE-REVIEW.md).

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
pnpm dev              # Next.js + QStash dev server (concurrently)
pnpm dev:next         # Next.js dev server only
pnpm dev:qstash       # QStash dev server only

# Build & Deploy
pnpm build           # Prisma generate + Next build
pnpm start           # Production server
pnpm check:prod      # Production readiness checks

# Testing & Linting
pnpm test            # Mocha tests (54 files)
pnpm test:e2e       # Playwright e2e tests
pnpm typecheck      # TypeScript check
pnpm lint          # ESLint
pnpm lint:fix      # ESLint fix
pnpm format        # Prettier (requires prettier in devDeps)

# Database
pnpm db:generate   # Prisma generate
pnpm db:push      # Prisma db push
pnpm db:migrate   # Prisma migrate dev
pnpm db:deploy    # Prisma migrate deploy (prod)
pnpm db:studio   # Prisma studio
```

## Architecture

### Directory Structure

- `app/` - Next.js App Router pages and API routes
- `lib/` - Core utilities, services, infrastructure
- `modules/` - Domain modules (25 feature modules)
- `components/` - UI components
- `prisma/` - Database schema
- `test/` - Mocha unit tests (54 files)
- `hooks/` - React hooks and state (replaces former `stores/` Zustand layer)

### Database Models

30 models in `prisma/schema.prisma`:
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
- UserActivity (CHECK constraint)
- ThreadInvitation
- AiSearchSession, AiSearchResult
- AiUsageLog (costUsd)
- ThreadRelation
- Feedback

### Key Services

- **AI** (`lib/ai/gemini.ts`, `lib/ai/openai.ts`, `lib/ai/factory.ts`): GeminiService, OpenAIService with summaries, thread DNA, resolution scores, image NSFW moderation
- **Auth** (`lib/services/auth.ts`): Better Auth with email OTP
- **Rate Limit** (`lib/services/rate-limit.ts`): Upstash Redis-based rate limiting with in-memory fallback
- **Moderation** (`lib/services/moderation.ts`): Regex-based content filtering + AI inline + moderator notifications
- **AI Spend Cap** (`lib/services/ai-spend-cap.ts`): Dollar-based daily limit ($5.00) via Redis INCRBYFLOAT
- **AI Usage Logger** (`lib/services/ai-usage-logger.ts`): Per-request token counts and cost estimates
- **Daily Quota** (`lib/services/daily-quota.ts`): Per-user/day Redis quotas for AI inline, AI analysis, AI search, image moderation
- **Moderation SLA** (`lib/services/moderation-sla.ts`): Stale report escalation (>24h/72h)
- **Soft-Delete Purge** (`lib/services/soft-delete-purge.ts`): Purges soft-deleted users after 30 days

### Design System

All UI follows SAI design tokens defined in `app/globals.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--rounded-card: 14px` | Cards, panels, modals | `rounded-card` |
| `--rounded-control: 6px` | Buttons, inputs, small interactive | `rounded-control` |
| `--rounded-chip: 6px` | Badges, tags, pills | `rounded-chip` |
| `--shadow-card` | Card elevation | `shadow-card` |
| `--ink`, `--ink-2`, `--ink-3` | Primary/secondary/tertiary text | `text-ink`, `text-ink-2`, `text-ink-3` |
| `--canvas` | Page background | `bg-canvas` |
| `--surface` | Card/panel background | `bg-surface` |
| `--line` | Borders | `border-line` |
| `--hover` | Hover states | `bg-hover` |

**Enforcement rules:**
- Every card/panel: `border border-line rounded-card shadow-card`
- No `rounded-xl`, `rounded-2xl`, `rounded-lg` on card-level containers
- Fonts: Geist sans (`font-sans`), Instrument Serif headings (`font-serif-heading`), Geist Mono (`font-mono`)
- No inline `style={{ fontFamily: '...' }}` — use Tailwind font classes

### Shared Components

- `components/ui/detail-card.tsx` — `<DetailCard>`: standard card wrapper (`rounded-card border border-line bg-surface shadow-card p-5`). Used by ThreadResolutionCard, ThreadSummaryCard, RelatedThreadsCard, ParticipantsCard.
- `components/ui/overflow-menu.tsx` — `<OverflowMenu>`: kebab "..." menu for rare actions (retry/feedback in StreamingText, formatting in PostMessageForm).

### SaiSearch Architecture

The search page (`/dashboard/sai-search`) is a **chat-style interface** with conversation continuity:

**State** (`components/ai-search/use-search-conversation.ts` + `search-provider.tsx`, wrapper `SearchPage.tsx`):
- `messages: ChatMessage[]` — conversation history (user + assistant turns)
- `streamingMessage: ChatMessage | null` — in-progress response during SSE stream
- `currentSessionId` — UUID persisted across the conversation, sent to API
- `sessionIdRef` — ref mirror of `currentSessionId` to avoid stale closures in SSE handlers
- `streamingDataRef` — accumulates SSE data outside React state, finalized on `done` event

**ChatMessage type:**
```typescript
interface ChatMessage {
  id: string;           // crypto.randomUUID()
  role: 'user' | 'assistant';
  query: string;
  text?: string;        // synthesis text (assistant only)
  sources?: Source[];
  citations?: Citation[];
  followUps?: string[];
  conflictData?: ConflictInfo;
  queryType?: QueryType;
  sourceCount?: number;
  timestamp: number;
}
```

**Flow:**
1. User types query → `runSearch()` adds user message to `messages`, creates empty assistant message in `streamingMessage`
2. SSE events update `streamingDataRef` and `streamingMessage` (sources, phase)
3. On `done`: finalize `streamingDataRef` into a `ChatMessage`, append to `messages`, clear `streamingMessage`
4. Follow-up queries send `conversationHistory` (last 10 messages) to API for context

**API** (`app/api/ai/forum-search/route.ts`):
- Accepts `sessionId` (UUID) and `conversationHistory` (last N messages)
- Passes history to `executeAISearch()` → `synthesize()` which includes it in the LLM prompt
- First query in a session creates a new `AiSearchSession` row; subsequent queries reuse the `sessionId`

**Sources:** No separate sources section. Sources appear only as inline citation chips in `StreamingText` and in the expandable sources drawer within `SynthesisCard`.

### Thread Page Architecture

The thread page (`/dashboard/threads/[slug]`) uses a **drawer-based layout**:

- **Header** (`thread-page-header.tsx`): `h-14`, icon-only subscribe/invite buttons, green dot for live indicator, no Hash icon box
- **Sidebar** (`thread-details-panel.tsx`): Slide-over drawer triggered by `PanelRightOpen` icon at `fixed top-[4.5rem] right-4`. Contains DetailCard-wrapped panels (resolution, summary, DNA, related, participants)
- **Composer** (`post-message-form.tsx`): 4 visible toolbar icons (Paperclip, Emoji, @sai, format overflow with Bold/Italic/Code/Link/Poll), icon-only Send button
- **Messages** (`thread-live-wrapper.tsx`): No mobile summary bar, InlinePoll kept as poll creation drawer

### Background Jobs

- QStash webhook callback at `app/api/jobs/route.ts`
- Job handlers in `lib/queue/workers/ai-jobs.ts` (coalesced), `ai-inline.worker.ts` and `email.worker.ts` (re-exported via `workers/index.ts`)
- Vercel Cron for scheduled tasks (update-threads, cleanup-blobs, daily-digest)
- Jobs: thread summary, thread DNA, resolution score, conflict detection, daily digest, AI inline, email, staleness check, AI insight notifications
- Jobs retry 1x via QStash (3x for `email`/`CRITICAL_JOBS`); non-retryable `AppError` returns 200 to prevent retry amplification

### API Routes

- `/api/auth/*` - Authentication endpoints
- `/api/threads/*` - Thread operations
- `/api/messages/*` - Message operations
- `/api/ai/*` - AI-powered features (forum-search SSE, thread-summary, thread-dna, resolution-score, search-history, spend)
- `/api/cron/*` - Scheduled jobs (cron auth via `CRON_SECRET` Bearer token)
- `/api/jobs` - QStash webhook callback for background jobs
- `/api/v1/moderation/*` - Moderation tools (admin-only)
- `/api/bootstrap`, `/api/health`, `/api/search`, `/api/upload`, `/api/invitations/accept`, `/api/csp-report`, `/api/email-otp/*` etc. — see `shared/ARCHITECTURE.md` for full 35-route inventory

## Authorization Patterns

**All API routes and server actions must enforce thread access checks.**

- **Thread access model** is the primary authorization primitive — see `lib/thread-access.ts` (`requireThreadAccessOrThrow`, `requireThreadWriteOrThrow`, `canAccessThread`, `canManageThread`). There is no membership table; access is derived from thread `visibility`, `createdBy`, and accepted `ThreadInvitation` rows.
- **Visibility rule (private/restricted threads):** creator OR accepted `ThreadInvitation` OR global MODERATOR/ADMIN. Public threads are readable by anyone; writes still require a session.
- Routes/actions that read/write thread data must call `requireThreadAccessOrThrow(threadId, userId, role)` / `requireThreadWriteOrThrow(...)`.
- `requireSession()` / `auth.api.getSession()` for authentication only — does NOT check access.
- Admin-only: `assertAdmin(session.user)` in thread actions, `requireAdmin()` / `requireModerator()` for API routes.
- Messages: posting and reading require thread access (`modules/messages/actions.ts`).
- AI routes (`thread-dna`, `resolution-score`, `ai-reply`) require thread access.

## Test Coverage

- **Current**: 54 Mocha test files covering utilities, services, API routes, and some components
- **E2E**: Playwright smoke tests in `test/e2e/`
- **Missing**: integration tests with real DB, component storybook

## Architecture Notes

- Server actions use `createServerAction` from `lib/utils/server-action.ts`
- Auth handled manually inside action handlers via `requireSession()`
- `Result<T, E>` type and `safeAction` wrapper removed — use `{ data, error, errorCode, ok }` return objects

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection (Neon)
- `BETTER_AUTH_SECRET` - Auth secret (32+ chars)
- `BETTER_AUTH_URL` - Auth base URL
- `NEXT_PUBLIC_APP_URL` - Public URL
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Redis for caching/queues (degrades gracefully without it; `REDIS_URL` TCP is legacy)
- `CRON_SECRET` - Bearer token for cron endpoints (32+ chars, required in production)
- `QSTASH_TOKEN` + `QSTASH_URL` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` - Upstash QStash
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + templates (`RESEND_*_TEMPLATE_ID`) - Email
- `GEMINI_API_KEY` or `OPENAI_API_KEY` - AI provider
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob

Optional/feature flags:
- `RATE_LIMIT_ENABLED` - Set to `false` to disable rate limiting
- `GITHUB_CLIENT_ID/SECRET` - GitHub OAuth
- `GOOGLE_CLIENT_ID/SECRET` - Google OAuth
- `SASTRAM_EXA_KEY` / `SASTRAM_TAVILY_KEY` - AI search providers
- `NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED` - View transitions (default true)

## CI

GitHub Actions workflow in `.github/workflows/ci.yml` — runs typecheck, lint, build, and tests with PostgreSQL + Redis service containers, gitleaks and audit checks.