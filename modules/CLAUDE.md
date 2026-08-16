# Modules Directory

## Overview

Domain modules implementing business logic, organized by feature. 25 modules. Each module typically contains actions, optionally repository, types, and schemas.

## Module List

### Authentication
- `modules/auth/` - Session management, OAuth

### Core Features
- `modules/users/` - User CRUD, profiles, avatar/banner upload
- `modules/threads/` - Thread CRUD, slug routing, relations
- `modules/messages/` - Messages with tree threading (post, edit, delete, mentions, AI inline)
- `modules/search/` - Full-text thread/message search

### Social Features
- `modules/reactions/` - Emoji reactions
- `modules/follows/` - User following
- `modules/bookmarks/` - Saved threads
- `modules/notifications/` - In-app notifications
- `modules/read-receipts/` - Per-user thread read state

### Engagement
- `modules/polls/` - Embedded polls
- `modules/tags/` - Thread tags
- `modules/activity/` - Activity tracking
- `modules/feedback/` - User feedback submissions

### Communication
- `modules/newsletter/` - Email digests
- `modules/invitations/` - Thread invitations
- `modules/members/` - Thread membership views

### Moderation
- `modules/moderation/` - Moderation rules, policy, executors
- `modules/appeals/` - Moderation appeals
- `modules/reports/` - Report management
- `modules/policy/` - Policy lookups
- `modules/audit/` - Audit logging

### Automation
- `modules/ai-search/` - AI forum search: service, cache, citations, query warming

## Removed Modules
The following modules no longer exist (removed during refactor):
- `modules/ws/` - WebSocket layer (removed; replaced by SSE streaming)
- `modules/chat/` - Chat module (removed; functionality in `components/thread/` and `modules/messages/`)
- `modules/reputation/` - Reputation system (removed)
- `modules/badges/` - Badge system (removed)

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

Unit tests use Mocha + Chai. Tests live in `test/` directory.
