# Modules Directory

## Overview

Domain modules implementing business logic, organized by feature. 25 modules. Each module typically contains actions, optionally repository, types, and schemas.

## Module Categories

### Authentication
- `modules/auth/` - Session management, OAuth

### Core Features
- `modules/users/` - User CRUD, profiles, expertise
- `modules/threads/` - Thread management (split into threads-core, threads-read, threads-write, threads-relations)
- `modules/topics/` - Topic creation with tags
- `modules/messages/` - Messages with tree threading (ports/adapters)
- `modules/search/` - Full-text thread/message search

### Social Features
- `modules/reactions/` - Emoji reactions
- `modules/follows/` - User following
- `modules/bookmarks/` - Saved threads
- `modules/notifications/` - Notifications
- `modules/read-receipts/` - Per-user message read state

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
- `modules/admin/` - Admin functions

### Automation
- `modules/ai-search/` - AI forum search: service, cache, citations, query warming

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

## Testing Notes

Unit tests use Mocha + Chai. Tests live in `test/` directory.