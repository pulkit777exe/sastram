# Sastram Feature & Function Context

This document provides a quick reference to the main features and functions available in the Sastram application. It's designed to help developers and contributors understand the purpose and location of key functionality.

## Authentication & Authorization

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
- **UI:** `app/(protected)/dashboard/threads/`, `components/dashboard/topic-grid.tsx`

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
- **API Response Wrapper:** `lib/http/api-response.ts`
- **Validation Helpers:** `lib/validation/withValidation.ts`

### External Services
- **AI Integration:** `lib/services/ai.ts` (Google Gemini, OpenAI)
- **Email:** `lib/services/auth.ts` (Resend)
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
- **Script:** `npm run test`

## Development & Deployment

### Development Server
- **Command:** `npm run dev`
- **Configuration:** `next.config.ts`

### Build & Deployment
- **Build:** `npm run build`
- **Start:** `npm run start`
- **Server Configuration:** `server.ts`

### Database Management
- **Generate Prisma Client:** `npm run db:generate`
- **Push Changes:** `npm run db:push`
- **Run Migrations:** `npm run db:migrate`
- **Studio:** `npm run db:studio`

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
