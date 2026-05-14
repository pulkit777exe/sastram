# Lib Directory

## Overview

Core utilities, services, and infrastructure code. The backbone of the application.

## Subdirectories

### `lib/config/`
Environment variables, permissions, routes, constants.
- `env.ts` - Zod-validated environment variables
- `permissions.ts` - Role-based access control
- `routes.ts` - API route definitions

### `lib/services/`
Business logic services.
- `ai.ts` - Gemini/OpenAI integration
- `auth.ts` - Better Auth configuration
- `email.ts` - SMTP email sending
- `moderation.ts` - Content moderation
- `rate-limit.ts` - Redis rate limiting
- `content-safety.ts` - Profanity filtering

### `lib/infrastructure/`
Database, cache, WebSocket.
- `prisma.ts` - Prisma Client (Neon adapter)
- `websocket/server.ts` - WS server
- `redis-pubsub.ts` - Redis pub/sub

### `lib/utils/`
Utility functions.
- `result.ts` - Result type for error handling
- `action-wrapper.ts` - Server action wrapper
- `slug.ts` - Slug generation
- `validation.ts` - Zod validation helpers

### `lib/schemas/`
Zod validation schemas.
- `database.ts` - Prisma model schemas
- `api.ts` - API request/response schemas
- `websocket.ts` - WebSocket message schemas

### `lib/middleware/`
- `moderation.ts` - Request content moderation

### `lib/http/`
- `api-response.ts` - Standardized API responses

### `lib/db/`
- `pagination.ts` - Cursor-based pagination

## Testing Notes

Services have Mocha unit tests covering moderation, schemas, content safety.

## Known Issues

None currently identified.