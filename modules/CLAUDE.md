# Modules Directory

## Overview

Domain modules implementing business logic, organized by feature. Each module typically contains actions, optionally repository, types, and schemas.

## Module Categories

### Authentication
- `modules/auth/` - Session management, OAuth

### Core Features
- `modules/users/` - User CRUD, profiles, expertise
- `modules/communities/` - Community management
- `modules/sections/` - Section/topic management (threads)
- `modules/messages/` - Messages with tree threading

### Social Features
- `modules/reactions/` - Emoji reactions
- `modules/follows/` - User following
- `modules/bookmarks/` - Saved threads
- `modules/notifications/` - Real-time notifications

### Engagement
- `modules/polls/` - Embedded polls
- `modules/tags/` - Thread tags
- `modules/badges/` - Gamification badges
- `modules/reputation/` - Reputation points
- `modules/activity/` - Activity tracking

### Communication
- `modules/chat/` - Real-time chat components
- `modules/newsletter/` - Email digests
- `modules/invitations/` - Thread invitations

### Moderation
- `modules/moderation/` - Moderation rules, appeals
- `modules/reports/` - Report management
- `modules/admin/` - Admin functions

### Automation
- `modules/ai/` - AI search integration (in service)
- `modules/ws/` - WebSocket publisher

## Key Patterns

### Actions Pattern
```typescript
// modules/[feature]/actions.ts
'use server'
import { prisma } from '@/lib/infrastructure/prisma'
import { action } from '@/lib/utils/action-wrapper'

export const actionName = action(...)
```

### Repository Pattern
```typescript
// modules/[feature]/repository.ts
export const findById = async (id: string) => prisma.xxx.findUnique(...)
```

### Types Pattern
```typescript
// modules/[feature]/-types.ts
export type FeatureType = { ... }
```

## Testing Notes

Unit tests use Mocha + Chai. Tests live in `test/` directory.

## Known Issues

1. `modules/newsletter/actions.ts:101,106` - Prisma relation type error