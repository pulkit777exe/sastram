# Sastram Feature and Function Context

Quick reference for the main features and functions in Sastram.

## Authentication and Authorization

### User Authentication
- **Purpose:** Handles user login, registration, and session management
- **Location:** `modules/auth/`
- **Key Files:**
  - `modules/auth/session.ts` - Session management
  - `modules/users/` - User profile management
- **API Routes:** `app/api/auth/[...all]/route.ts`
- **UI:** `components/auth/LoginForm.tsx`, `app/(public)/login/page.tsx`

### Role-Based Access Control
- **User Roles:** USER, MODERATOR, ADMIN
- **Permissions:** `lib/config/permissions.ts`
- **Thread Access:** `lib/thread-access.ts` (visibility + invitation based)
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
- **UI:** `app/(protected)/dashboard/threads/` (list), thread detail pages

### Message Handling
- **Purpose:** Send, view, and manage messages within threads
- **Location:** `modules/messages/`
- **Key Files:**
  - `modules/messages/actions/` - Message operations (post, edit, delete, mentions, ai-inline)
  - `modules/messages/schemas.ts` - Validation schemas
- **UI:** `components/thread/comment-tree.tsx`, `components/thread/message-list.tsx`

### Search Functionality
- **Purpose:** Search for threads and content
- **Location:** `modules/search/`
- **Key Files:**
  - `modules/search/actions.ts` - Search operations
- **UI:** `app/(protected)/dashboard/search/`

### AI Search
- **Purpose:** AI-powered forum search (brand: Sai)
- **Location:** `modules/ai-search/`
- **Key Files:**
  - `modules/ai-search/service.ts` - Exa + Tavily + Gemini pipeline
  - `modules/ai-search/cache.ts` - SHA-256 query-hash caching
- **UI:** `components/ai-search/`, `app/(protected)/dashboard/sai-search/`

## Community and Social Features

### User Profiles
- **Purpose:** View and manage user profiles
- **Location:** `modules/users/`
- **UI:** `app/(protected)/user/[userId]/`, `components/user/`

### Follows and Connections
- **Purpose:** Follow users and manage connections
- **Location:** `modules/follows/`
- **UI:** `components/user/follow-button.tsx`

### Bookmarks
- **Purpose:** Save and manage bookmarks
- **Location:** `modules/bookmarks/`
- **UI:** `app/(protected)/dashboard/bookmarks/`, `components/thread/bookmark-button.tsx`

### Notifications
- **Purpose:** In-app notifications
- **Location:** `modules/notifications/`
- **UI:** `components/notifications/notification-list.tsx`

### Reactions
- **Purpose:** Emoji reactions on messages
- **Location:** `modules/reactions/`

### Read Receipts
- **Purpose:** Per-user thread read tracking
- **Location:** `modules/read-receipts/`

### Activity Tracking
- **Purpose:** User activity logging
- **Location:** `modules/activity/`

## Moderation and Safety

### Content Moderation
- **Purpose:** Review and moderate content
- **Location:** `modules/moderation/`
- **API Routes:** `app/api/v1/moderation/`
- **UI:** `app/(protected)/dashboard/admin/moderation/`

### Report System
- **Purpose:** Report inappropriate content
- **Location:** `modules/reports/`
- **UI:** `components/admin/`

### Appeal Process
- **Purpose:** Appeal moderation decisions
- **Location:** `modules/appeals/`
- **UI:** `components/appeals/`

### User Bans
- **Purpose:** Manage user bans
- **Location:** `modules/moderation/`
- **UI:** `app/banned/page.tsx`

### Policy Enforcement
- **Purpose:** Policy lookups
- **Location:** `modules/policy/`

### Audit Logging
- **Purpose:** Audit trail
- **Location:** `modules/audit/`

## Newsletter System

### Newsletter Subscription
- **Purpose:** Subscribe to thread newsletters
- **Location:** `modules/newsletter/`
- **UI:** `components/thread/subscribe-button.tsx`

### Digest Generation
- **Purpose:** Generate and send email digests
- **Key Files:**
  - `lib/services/ai.ts` - AI summarization
  - `lib/services/email.ts` - Email sending

## Additional Features

### Polls
- **Purpose:** Create and manage polls in threads
- **Location:** `modules/polls/`
- **UI:** `components/thread/poll-display.tsx`

### Thread Invitations
- **Purpose:** Invite users to threads
- **Location:** `modules/invitations/`
- **UI:** `components/thread/invite-friend-button.tsx`

### Tags and Categories
- **Purpose:** Organize content with tags
- **Location:** `modules/tags/`
- **UI:** `components/thread/tag-chip.tsx`

### Thread Membership
- **Purpose:** Thread membership management
- **Location:** `modules/members/`

### Topics
- **Purpose:** Thread categories
- **Location:** `modules/topics/`

### Feedback
- **Purpose:** In-app feedback widget
- **Location:** `modules/feedback/`

## System Components

### Real-Time Communication
- **SSE Streaming:** `app/api/threads/[threadId]/ai-reply/stream/route.ts`
- **SSE Consumer:** `hooks/useAIReplyStream.ts`
- **AI Reply:** Server-Sent Events for token streaming
- **No WebSocket layer** — this is a serverless forum-style platform

### Database Access
- **ORM:** Prisma
- **Schema:** `prisma/schema.prisma` (30 models)
- **Client:** `lib/infrastructure/prisma.ts`
- **Migrations:** `prisma/migrations/`

### Configuration
- **Environment Variables:** `lib/config/env.ts` (validated with Zod)
- **Constants:** `lib/config/constants.ts`
- **Routes:** `lib/config/routes.ts`
- **Permissions:** `lib/config/permissions.ts`

### Infrastructure
- **Logger:** `lib/infrastructure/logger.ts`
- **Prisma:** `lib/infrastructure/prisma.ts`
- **Redis:** `lib/infrastructure/redis.ts`, `lib/infrastructure/redis-upstash.ts`
- **Query Cache:** `lib/infrastructure/query-cache.ts`
- **API Response Helpers:** `lib/utils/api-response.ts`
- **Server Action Wrapper:** `lib/utils/server-action.ts`

### External Services
- **AI Integration:** `lib/services/ai.ts` (Google Gemini, OpenAI) — user-facing brand "Sai"
- **Email:** `lib/services/email.ts` (Resend)
- **Queue:** `lib/services/queue.ts` (Upstash QStash)

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
- **Chat:** `components/chat/` - Message composition
- **Panels:** `components/panels/` - Thread info panels
- **AI Search:** `components/ai-search/` - Search interface

## State Management

### Client-Side State
- **Library:** Zustand
- **Hooks:** `hooks/` (useAIReplyStream, use-message-composer)

## Testing
- **Framework:** Mocha + Chai
- **Location:** `test/`
- **E2E:** Playwright in `test/e2e/`
- **Script:** `pnpm test`

## Development and Deployment

### Development Server
- **Command:** `pnpm dev`
- **Configuration:** `next.config.ts`

### Build and Deployment
- **Build:** `pnpm build`
- **Start:** `pnpm start`

### Database Management
- **Generate Prisma Client:** `pnpm db:generate`
- **Push Changes:** `pnpm db:push`
- **Run Migrations:** `pnpm db:migrate`
- **Studio:** `pnpm db:studio`

## File Structure Summary

```
app/                      # Next.js App Router pages and API routes
components/               # React UI components
lib/                      # Shared utilities and infrastructure
modules/                  # Domain logic (25 feature modules)
prisma/                   # Database schema and migrations
public/                   # Static assets
scripts/                  # Helper scripts
test/                     # Test files
shared/                   # Shared documentation
```

## How to Navigate the Codebase

1. **Finding Features:** Look in `modules/` for domain-specific functionality
2. **UI Components:** Check `components/` for React components
3. **API Routes:** Located in `app/api/`
4. **Database Schema:** `prisma/schema.prisma`
5. **Configuration:** `lib/config/`
6. **Infrastructure:** `lib/infrastructure/`

Use this document as a starting point to explore specific features. Each module directory contains `actions.ts` for server operations, `repository.ts` for data access, and `types.ts` for type definitions.
