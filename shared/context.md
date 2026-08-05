# Sastram Feature & Function Context

This document provides a quick reference to the main features and functions available in the Sastram application. It's designed to help developers and contributors understand the purpose and location of key functionality.

## Authentication & Authorization

### User Authentication

- **Purpose:** Handles user login, registration, and session management
- **Location:** `modules/auth/`
- **Key Files:**
  - `modules/auth/session.ts` - Session management
  - `modules/users/` - User profile management
- **API Routes:** `app/api/auth/[.# Design & Interaction Modernization Prompt — Coach-XYZ

## 0. Guardrails (read before anything else)

This is a visual/interaction pass, **not** a license to touch backend logic, the state machine,
polling behavior, or anything in Section 7 (Non-Negotiable Invariants) of
`coach-xyz-canonical-spec.md`. A design change must never regress a functional fix — the
`AnalysisDetailClient.tsx` poll-stop-on-`complete` fix and the retry state machine are especially
easy to break by accident while "just" restyling a loading state. If a redesign touches a file
that also carries logic (very likely for `usePipeline.ts`, `AnalysisDetailClient.tsx`,
`AnalysisProgress.tsx`), isolate the logic from the presentation first — don't rewrite both at
once.

**"Modern" here means specific, not generic.** Do not default to glassmorphism, gratuitous
spring bounces, or a light SaaS template look. The existing identity — dark (`#0d0d0d`/
`#f0ebe1`/`#c8003c`), DM Mono + Instrument Serif, editorial/restrained — is a strength, not a
starting point to discard. The goal is: this identity, executed with the polish, motion
continuity, and considered micro-interaction of a well-built modern product, not a different
identity.

**Discovery before rewrite, same discipline as every other pass:** check what animation tooling
already exists (GSAP is confirmed in use on the landing page only — check `package.json` for
anything else, e.g. Framer Motion/Motion, before introducing a new dependency) before assuming
you need a new library. Extend the existing hand-rolled `components/ui/` primitives — don't fork
a parallel design system next to them.

**No big-bang rewrite.** Work component by component, in the phases below, with a checkpoint
before implementation starts on each phase. A full-app redesign landed as one diff is
unreviewable and, given the app's recent history of regressions, the highest-risk possible way
to ship this.

---

## Phase 1 — Discovery & audit (report back before proceeding)

1. Inventory every page/component currently in the pipeline (landing, upload, scanning,
   selecting, analyzing/rendering, completed, error, dashboard, history, analysis detail,
   account) with file:line for each.
2. Confirm what's already inconsistent *before* introducing new motion — e.g. is film grain
   really landing-only (flagged as a known gap), are loading states consistent across
   components, is spacing/typography actually following a scale or ad hoc per component? You
   cannot build smooth systematic motion on top of inconsistent foundations — inconsistencies
   found here need to be named as a prerequisite, not skipped past.
3. Confirm current animation tooling: GSAP usage scope, whether any other animation library is
   installed, whether Tailwind's built-in transition utilities are used consistently or
   piecemeal.
4. Check for `prefers-reduced-motion` handling anywhere in the codebase currently. Report
   whether it exists at all — if not, it needs to be part of the motion system from the start,
   not bolted on later.

Report format: same CONFIRMED/DRIFTED/MISSING discipline as prior audits, file:line, no prose
summary layer.

---

## Phase 2 — Design system extension (propose, don't implement yet)

Propose, don't build:

1. **Spacing/typography scale** — formalize whatever's implicit today into an explicit scale,
   reusing current values as the base (don't invent new type sizes/colors from scratch — derive
   from what's already there).
2. **Elevation/depth system for the dark theme** — flat `#0d0d0d` panels reading as "modern" vs.
   "unfinished" usually comes down to subtle elevation (soft shadows, faint borders, slight
   background value shifts between layers), not brightness. Propose a small, restrained scale
   (e.g. 2-3 elevation levels), not a dozen.
3. **Motion tokens** — a duration scale (e.g. fast/base/slow) and one or two easing curves, used
   consistently everywhere rather than bespoke timing per component. Sports-coaching content
   should read as calm and precise, not playful — bias toward short durations (150-300ms) and
   restrained easing over bouncy/springy defaults.
4. **Component state coverage** — for each existing primitive (`Button`, `Card`, `Badge`,
   `Separator`), define hover/active/disabled/loading states explicitly if they aren't already,
   so new components built during this pass have something consistent to reference.

**Checkpoint: report this proposal and wait for approval before moving to Phase 3.**

---

## Phase 3 — Per-functionality rethink (propose, don't implement yet)

For each item below, the ask is a genuine rethink of the *interaction*, not just a re-skin.
Propose the concept in words/wireframe-level description first — this phase produces a plan,
not code.

| Feature | Current state | Rethink prompt |
|---|---|---|
| **Landing / upload zone** | 657-line marketing page, film grain, upload zone | Does the upload moment feel like the product's front door, or an afterthought at the bottom of a marketing page? Consider whether upload should be more prominent/immediate rather than requiring a scroll. |
| **Scanning / player selection** | Grid of base64 crops with confidence badges | This is a decision moment for the user — does it feel considered, or like a raw data dump? Consider progressive reveal, clearer visual hierarchy for confidence, subtle entrance animation per card rather than all appearing at once. |
| **Analyzing / rendering** | Stage stepper + ETA (`AnalysisProgress`) | This is 45-150s of waiting — the highest-anxiety moment in the flow. Modern apps often replace static progress bars with live status narration, skeleton previews of what's coming, or subtle ambient motion that signals "working," not just a percentage. Rethink what reduces perceived wait time, not just what looks nicer. |
| **Results summary** | Form score, tips, strengths, shot event timeline, download | Dense stat display — consider card hierarchy (what's the one number the user's eye should land on first?), whether shot events benefit from a timeline/visual treatment vs. a list, and how the reveal from `rendering` → `completed` transitions (should not be a hard cut). |
| **Error screens** | 25+ code mappings, auto-retry countdown | Should read as calm and solvable, not alarming — consistent iconography/tone across all 25+ codes rather than each feeling ad hoc. Consider how retry (now correctly wired end-to-end per the verification sweep) is surfaced so the user trusts it's actually working, not just clicking into a void. |
| **History page** | Paginated list with status badges | Modern list views use hover-elevate affordance, meaningful empty states (a brand-new user's empty history page is a real screen someone will see — design it, don't leave it blank), and clear visual distinction between complete/failed/in-progress beyond just badge color. |
| **Analysis detail (state-aware)** | Just built — server-rendered shell + client poller | This is new enough to design well from the start rather than retrofit. Consider how the transition from "in progress" to "complete" renders in place (smooth reveal) rather than a jarring content swap. |
| **Account page** | Currently minimal / still being verified separately | Once the auth audit from the verification sweep reports back, this needs real design attention — don't design it blind before that lands. |
| **Dashboard home** | Recent analyses overview | Consider whether this is currently just a smaller history list or has distinct purpose (quick stats, continue-where-you-left-off surfacing for in-progress jobs). |

For each row, deliver: the rethought concept, what specifically changes (layout, motion,
information hierarchy — call out which), and explicit confirmation that no invariant from
Section 7 of the canonical spec is affected by the change.

**Checkpoint: report all proposals together and wait for approval before any implementation.**
Approve/reject per-row is expected — this table is not all-or-nothing.

---

## Phase 4 — Implementation (only after Phase 2 and 3 are approved)

- One component/feature at a time, in priority order to be set at approval time (suggest:
  analyzing/rendering and error screens first, since those are the highest-anxiety, highest
  user-facing-trust moments; landing page last, since it's lowest-risk to get wrong).
- Every new transition/animation must have a `prefers-reduced-motion` fallback from the start,
  not added after.
- Animate `transform`/`opacity` only where possible — avoid animating layout-triggering
  properties (width/height/top/left) for performance.
- After each component: confirm via the existing manual acceptance checks (from the routing
  prompt) that no functional behavior regressed — refresh mid-flow, back/forward navigation,
  retry-after-failure — still all need to work exactly as verified, just with better motion
  around them.
- Report progress component-by-component, not as one final batch — this lets fixes get reviewed
  incrementally rather than as one large, hard-to-review diff.

---

## Report format throughout

Same discipline as every other pass in this project: CONFIRMED/DRIFTED/MISSING for discovery,
file:line citations, raw findings, explicit checkpoints before implementation — propose, wait,
then build...all]/route.ts`
- **UI:** `components/auth/LoginForm.tsx`, `app/(public)/login/page.tsx`

### Role-Based Access Control

- **User Roles:** USER, MODERATOR, ADMIN
- **Permissions:** `lib/config/permissions.ts`
- **Middleware:** `app/(protected)/layout.tsx` (protected routes)

## Core Forum Features

### Thread Management

- **Purpose:** Create, view, edit, and delete forum threads
- **Location:** `modules/threads/`
- **Key Files:**
  - `modules/threads/actions.ts` - Server actions
  - `modules/threads/repository.ts` - Data access
  - `modules/threads/service.ts` - Business logic
- **API Routes:** `app/api/threads/route.ts`
- **UI:** `app/(protected)/dashboard/threads/` (list), `app/thread/[slug]/page.tsx` (detail), `components/dashboard/topic-grid.tsx`

### Message Handling

- **Purpose:** Send, view, and manage messages within threads
- **Location:** `modules/messages/`
- **Key Files:**
  - `modules/messages/actions.ts` - Message operations
  - `modules/messages/schemas.ts` - Validation schemas
- **Real-time Communication:** WebSocket server (`lib/infrastructure/websocket/`)
- **UI:** `components/thread/comment-tree.tsx`, `components/dashboard/message-grid.tsx`

### Search Functionality

- **Purpose:** Search for threads and content
- **Location:** `modules/search/`
- **Key Files:**
  - `modules/search/actions.ts` - Search operations
- **UI:** `app/(protected)/dashboard/search/`, `components/dashboard/search-dialog.tsx`

## Community & Social Features

### User Profiles

- **Purpose:** View and manage user profiles
- **Location:** `modules/users/`
- **Key Files:**
  - `modules/users/actions.ts` - User operations
- **UI:** `app/(protected)/user/[userId]/`, `components/user/`

### Follows & Connections

- **Purpose:** Follow users and manage connections
- **Location:** `modules/follows/`
- **Key Files:**
  - `modules/follows/actions.ts` - Follow operations
  - `modules/follows/repository.ts` - Data access
- **UI:** `components/user/follow-button.tsx`

### Bookmarks

- **Purpose:** Save and manage bookmarks
- **Location:** `modules/bookmarks/`
- **Key Files:**
  - `modules/bookmarks/actions.ts` - Bookmark operations
- **UI:** `app/(protected)/dashboard/bookmarks/`, `components/thread/bookmark-button.tsx`

### Reputation System

- **Purpose:** Track user reputation and badges
- **Location:** `modules/reputation/`, `modules/badges/`
- **Key Files:**
  - `modules/reputation/actions.ts` - Reputation management
  - `modules/badges/actions.ts` - Badge management

## Moderation & Safety

### Content Moderation

- **Purpose:** Review and moderate content
- **Location:** `modules/moderation/`
- **Key Files:**
  - `modules/moderation/index.ts` - Moderation logic
- **API Routes:** `app/api/v1/moderation/`
- **UI:** `app/(protected)/dashboard/admin/moderation/`, `components/admin/moderation-dashboard.tsx`

### Report System

- **Purpose:** Report inappropriate content
- **Location:** `modules/reports/`
- **Key Files:**
  - `modules/reports/actions.ts` - Report operations
- **UI:** `components/thread/report-button.tsx`, `components/admin/report-review-panel.tsx`

### Appeal Process

- **Purpose:** Appeal moderation decisions
- **Location:** `modules/appeals/`
- **Key Files:**
  - `modules/appeals/actions.ts` - Appeal operations
- **API Routes:** `app/api/v1/moderation/appeals/`
- **UI:** `app/(protected)/dashboard/admin/appeals/`, `components/appeals/appeal-form.tsx`

### User Bans

- **Purpose:** Manage user bans
- **Location:** `modules/moderation/`
- **UI:** `app/banned/page.tsx`, `components/admin/banned-users-list.tsx`

## Newsletter System

### Newsletter Subscription

- **Purpose:** Subscribe to thread newsletters
- **Location:** `modules/newsletter/`
- **Key Files:**
  - `modules/newsletter/actions.ts` - Subscription operations
  - `modules/newsletter/repository.ts` - Data access
  - `modules/newsletter/service.ts` - Newsletter service
- **API Routes:** `app/api/newsletter/generate/`
- **UI:** `components/thread/subscribe-button.tsx`, `components/dashboard/newsletter-management.tsx`

### Digest Generation

- **Purpose:** Generate and send email digests
- **Key Files:**
  - `lib/services/ai.ts` - AI summarization
- **Email Templates:** `lib/templates/email/newsletter-digest.html`

## Additional Features

### Polls

- **Purpose:** Create and manage polls in threads
- **Location:** `modules/polls/`
- **Key Files:**
  - `modules/polls/actions.ts` - Poll operations
  - `modules/polls/repository.ts` - Data access
- **UI:** `components/thread/poll-display.tsx`

### Thread Invitations

- **Purpose:** Invite users to threads
- **Location:** `modules/invitations/`
- **Key Files:**
  - `modules/invitations/actions.ts` - Invitation operations
- **UI:** `components/thread/invite-friend-button.tsx`

### Tags & Categories

- **Purpose:** Organize content with tags
- **Location:** `modules/tags/`
- **Key Files:**
  - `modules/tags/actions.ts` - Tag operations
- **UI:** `components/thread/tag-chip.tsx`

### Activity Tracking

- **Purpose:** Track user activity
- **Location:** `modules/activity/`
- **Key Files:**
  - `modules/activity/actions.ts` - Activity operations

## System Components

### Real-Time Communication

- **Purpose:** WebSocket-based real-time updates
- **Location:** `lib/infrastructure/websocket/`
- **Key Files:**
  - `lib/infrastructure/websocket/server.ts` - WebSocket server
  - `lib/infrastructure/websocket/client.ts` - Client-side WebSocket
- **Server Initialization:** `server.ts`

### Database Access

- **ORM:** Prisma
- **Schema:** `prisma/schema.prisma`
- **Client:** `lib/infrastructure/prisma.ts`
- **Migrations:** `prisma/migrations/`

### Configuration

- **Environment Variables:** `lib/config/env.ts` (validated with Zod)
- **Constants:** `lib/config/constants.ts`
- **Routes:** `lib/config/routes.ts`
- **Permissions:** `lib/config/permissions.ts`

### Infrastructure

- **Logger:** `lib/infrastructure/logger.ts`
- **API Response Helpers:** `lib/utils/api-response.ts`
- **Server Action Wrapper:** `lib/utils/server-action.ts`

### External Services

- **AI Integration:** `lib/services/ai.ts` (Google Gemini, OpenAI) — user-facing brand "Sai"
- **Email:** `lib/services/email.ts` (Resend)
- **File Storage:** `lib/services/blob.ts` (Vercel Blob)

## UI Components

### Common Components

- **UI Library:** shadcn/ui
- **Location:** `components/ui/`
- **Key Components:** Button, Card, Dialog, Input, Select, etc.

### Feature-Specific Components

- **Admin:** `components/admin/` - Moderation and admin interface
- **Dashboard:** `components/dashboard/` - Dashboard and home page
- **Thread:** `components/thread/` - Thread view and management
- **User:** `components/user/` - User profile and related

## State Management

### Client-Side State

- **Library:** TanStack Query (React Query)
- **Provider:** `components/providers.tsx`
- **Hooks:** `hooks/` (useConversations, useMessages)

## Testing

- **Framework:** Mocha + Chai
- **Location:** `test/`
- **Script:** `pnpm test`

## Development & Deployment

### Development Server

- **Command:** `pnpm dev`
- **Configuration:** `next.config.ts`

### Build & Deployment

- **Build:** `pnpm build`
- **Start:** `pnpm start`
- **Server Configuration:** `server.ts`

### Database Management

- **Generate Prisma Client:** `pnpm db:generate`
- **Push Changes:** `pnpm db:push`
- **Run Migrations:** `pnpm db:migrate`
- **Studio:** `pnpm db:studio`

## File Structure Summary

```
├── app/                      # Next.js App Router pages and API routes
├── components/               # React UI components
├── lib/                      # Shared utilities and infrastructure
├── modules/                  # Domain logic (feature modules)
├── prisma/                   # Database schema and migrations
├── public/                   # Static assets
├── scripts/                  # Helper scripts
├── stores/                   # State management
├── test/                     # Test files
└── shared/                   # Shared documentation
```

## How to Navigate the Codebase

1. **Finding Features:** Look in `modules/` for domain-specific functionality
2. **UI Components:** Check `components/` for React components
3. **API Routes:** Located in `app/api/`
4. **Database Schema:** `prisma/schema.prisma`
5. **Configuration:** `lib/config/`
6. **Infrastructure:** `lib/infrastructure/`

Use this document as a starting point to explore specific features. Each module directory contains `actions.ts` for server operations, `repository.ts` for data access, and `types.ts` for type definitions.
