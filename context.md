# Sastram - Project Context

This document captures the application context and feature map at a high level without exposing raw code.

## Overview
Sastram is a modern, AI-assisted forum built on Next.js with server actions, WebSockets for realtime threads, and a PostgreSQL/Prisma data layer. The product centers on communities, threaded discussions, live messaging, AI synthesis, moderation workflows, and newsletter digests.

## Stack
- Next.js App Router + Server Actions
- TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- Better Auth (session-based auth)
- TanStack Query for client caching
- WebSockets for live threads
- AI providers: Gemini and OpenAI

## Runtime Architecture
- Custom server in `server.ts` hosts Next.js HTTP + WebSocket server.
- WebSocket server initialization lives under `lib/infrastructure/websocket/server` and is consumed by thread clients.
- Middleware enforces auth for protected routes, applies security headers, and rate limiting.
- Bootstrap data for logged-in users is fetched via `/api/bootstrap` and cached client-side.

## Core Domains and Features
- **Auth & Sessions**: Better Auth, session helpers, server-side session access, and middleware route gating.
- **Communities & Threads**: Create communities, manage threads, tags, members, and thread metadata.
- **Realtime Threads**: Messages stream via WebSocket; reactions and mentions update live.
- **Search**: Search threads, messages, users; AI-enhanced forum search.
- **AI Summaries**: Thread summaries and newsletter digests from Gemini/OpenAI.
- **Moderation**: Rules, reports, appeals, bans, and queues for review workflows.
- **Notifications**: Mentions, replies, reactions, invitations, system signals.
- **Reputation & Badges**: Points, levels, and user badges.
- **Polls**: Thread-level polls with voting and results.
- **Bookmarks & Subscriptions**: Save threads and subscribe to digests.
- **Follows & Invitations**: Follow users, invite to threads, manage members.
- **Activity Feed**: Recent user activity and followed-user activity.
- **Chat**: Direct conversations and messages.
- **Admin**: Admin dashboard, audit logs, moderation queue, and management panels.

## AI Search (Dashboard)
- **Route**: `/dashboard/ai-search`
- **Endpoint**: `POST /api/ai/forum-search`
- **Pipeline**:
  - Classifies query (type/domain) using Gemini.
  - Searches across external sources using Exa and Tavily.
  - Ranks/tiers sources and produces an AI synthesis response.
  - Caches synthesis results by query.
- **Controls**: Supports search modes and source filters (docs, technical, reddit/hn, etc.).

## In-Thread AI
- **@ai reply**: Thread reply UI includes an `@ai` button which triggers an AI reply workflow for the current thread (`POST /api/threads/[threadId]/ai-reply`).
- **AI responses**: AI messages are flagged with `isAiResponse`/`isAI` and rendered distinctly in the thread UI.
- **Realtime delivery**: AI responses are streamed to clients via WebSocket events (`AI_RESPONSE_READY`).

## Mentions (@username / @email)
- Message content is parsed for `@username` and `@email` patterns.
- Mentioned users are resolved to user IDs and recorded on message creation.
- Mention notifications are generated and delivered via WebSocket (`MENTION_NOTIFICATION`) and email.

## Data Model (Prisma)
Key entities include:
- Users, Accounts, Sessions, Verifications
- Communities and Sections (threads)
- Messages, Reactions, Attachments
- Tags, Polls, Votes
- Notifications and Activity
- Reports, Appeals, Bans
- Thread subscriptions and newsletters
- Follows, Invitations, Memberships
- Reputation and Badges
- AI search sessions and expertise areas

## App Routes (UI)
Public:
- `/` landing
- `/login`
- `/pricing`

Protected:
- `/dashboard` and sub-pages for activity, search, bookmarks, messages, threads, settings, admin, moderation, reports, appeals
- `/dashboard/ai-search`
- `/chat`
- `/banned`
- `/user/[userId]`
- `/[community]/[thread]` thread view

## API Routes
General:
- `/api/bootstrap` user bootstrap data
- `/api/threads` list threads
- `/api/messages` message APIs
- `/api/conversations` chat APIs
- `/api/upload` uploads

Auth:
- `/api/auth/[...all]`
- `/api/sign-in/email-otp`
- `/api/forget-password/email-otp`
- `/api/email-otp/*`

AI:
- `/api/ai/forum-search`
- `/api/ai/thread-summary`

Newsletter:
- `/api/newsletter/generate`
- `/api/cron/daily-digest`

Moderation:
- `/api/v1/moderation/rules`
- `/api/v1/moderation/stats`
- `/api/v1/moderation/queue`
- `/api/v1/moderation/appeals/submit`
- `/api/v1/moderation/appeals/review/[id]`

## Realtime & Messaging
- WebSocket client connects using `NEXT_PUBLIC_WS_URL` to thread channels.
- Events include new messages, reactions, AI responses, and mention notifications.
- Server emits events via `modules/ws/publisher`.

## AI Features
- Gemini and OpenAI providers are supported.
- Thread summaries are generated via `/api/ai/thread-summary` and stored on threads.
- Daily digest emails summarize thread activity for subscribers.
- AI search produces synthesis + source lists for dashboard queries.

## Auth & Security
- `middleware.ts` gates protected routes, sets CSP/security headers, and rate limits API access.
- Role-based access controls for admin/moderation features.

## Project Layout
- `app/` Next.js routes (public + protected + API)
- `components/` UI components and feature views
- `modules/` domain logic, repositories, and server actions
- `lib/` shared utilities, infra clients, auth helpers
- `prisma/` schema and seeds
- `server.ts` custom server and WebSocket bootstrap

## Local Dev
- Install: `npm install`
- Run: `npm run dev`
- Seed: `npx prisma db seed`

## Notes
- This context file is intentionally high-level. For deeper implementation details, see `modules/`, `app/api`, and `components/`.
