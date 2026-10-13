# Modules Directory

## Overview

Domain modules implementing business logic, organized by feature. 24 modules. Each module typically contains actions, optionally repository, types, and schemas.

## Module List

### Authentication
- `modules/auth/` - Session management, OAuth (`session.ts`)

### Core Features
- `modules/users/` - User CRUD, profiles, account actions (`actions.ts`, `account-actions.ts`)
- `modules/threads/` - Thread CRUD, slug routing, relations, confidence decay (split into `threads-core` / `threads-read` / `threads-write` / `threads-relations` + `adapters` / `ports`)
- `modules/messages/` - Messages with tree threading (post, edit, delete, mentions, AI inline, moderation processor; `adapters` / `ports` / `actions/`)
- `modules/search/` - Full-text thread/message search
- `modules/ai-search/` - AI forum search: service, cache, citations, query warming, LLM, synthesis, search providers
- `modules/ai-reply/` - @sai inline reply service

### Social Features
- `modules/reactions/` - Emoji reactions
- `modules/follows/` - User following
- `modules/bookmarks/` - Saved threads
- `modules/notifications/` - In-app notifications (`repository` + `dispatcher` single-port dispatch)
- `modules/read-receipts/` - Per-user thread read state
- `modules/invitations/` - Thread invitations

### Engagement
- `modules/polls/` - Embedded polls (incl. prediction markets `isMarket`)
- `modules/tags/` - Thread tags
- `modules/activity/` - Activity tracking
- `modules/feedback/` - User feedback submissions
- `modules/collections/` - Workspace collections (+ `enabled.ts` feature gate)
- `modules/bounties/` - Thread bounties

### Communication
- `modules/newsletter/` - Email digests
- `modules/invitations/` - Thread invitations (sole owner; `members/` folded in, `getThreadRole` lives here)

### Moderation
- `modules/moderation/` - Moderation rules, policy, executors, dashboard
- `modules/appeals/` - Moderation appeals (3-jury votes)
- `modules/reports/` - Report management (actions + service for transactional logic)
- `modules/policy/` - Policy lookups
- `modules/activity/` - Activity tracking (sole `UserActivity` writer; `audit/` folded in)

## Removed Modules
The following modules no longer exist (removed during refactor):
- `modules/ws/` - WebSocket layer (removed; replaced by SSE streaming)
- `modules/chat/` - Chat module (removed; functionality in `components/chat/` and `modules/messages/`)
- `modules/topics/` - Duplicate thread-creation path (removed; canonical flow is `CreateThreadDialog` → `createThreadAction`)
- `modules/members/` - Folded into `invitations/` (D9)
- `modules/audit/` - Folded into `activity/` (D9)
- `modules/reputation/` - Reputation system as a module (removed; logic lives in `lib/services/reputation.ts`)
- `modules/badges/` - Badge system (removed)

Note: there is no `modules/admin/` — admin UI lives in `components/admin/` + `app/(protected)/dashboard/admin/` backed by existing domain modules.

## Key Patterns

### Actions Pattern
```typescript
// modules/[feature]/actions.ts
'use server'
import { prisma } from '@/lib/infrastructure/prisma'
import { createServerAction } from '@/lib/utils/server-action'

export const actionName = createServerAction(...)
```

### Repository Pattern
```typescript
// modules/[feature]/repository.ts
export const findById = async (id: string) => prisma.xxx.findUnique(...)
```

### Types Pattern
```typescript
// modules/[feature]/types.ts
export type FeatureType = { ... }
```

### Action Envelope
All server actions return a standardized envelope:
```typescript
{ ok: boolean, data?: T, error?: string, errorCode?: ActionErrorCode }
```

Use `actionSuccess(data)` and `actionFailure(errorCode, message)` from `lib/actions/result.ts`.

## Testing Notes

Unit tests use Mocha + Chai. Tests live in `test/` directory (63 files), including `test/bookmarks.action.test.mts` and API route tests.
