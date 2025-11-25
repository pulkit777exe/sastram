<samp>
    stack: next.js, tailwindcss, typescript, better-auth, tanstack query, websocket, vercel
</samp>

## Architecture

- `/app/(public)` holds unauthenticated routes (`/login` only). Everything else lives inside `/app/(protected)` and is guarded by Better Auth + middleware cookies.
- `/modules` contains coarse-grained domain logic:
  - `modules/auth` – helpers for sessions/roles.
  - `modules/threads` – Prisma repositories, DTO builders, server actions, and API client helpers.
  - `modules/newsletter` – subscription + digest pipeline powered by `lib/ai`.
  - `modules/ws` – event publisher used by server actions to push WebSocket updates.
- `/lib/ws/server` & `/lib/ws/client` expose thread-scoped WebSocket plumbing. Each thread maps to `/ws/thread/<id>`.
- UI pieces live under `/components`. Long-lived UI primitives live in `/components/ui`; feature specific UI lives in folders such as `components/dashboard` or `components/thread`.

## Running the project

```bash
npm install
npm run dev
```

The dev server bootstraps the HTTP + WebSocket server defined in `server.ts`.

## Workflows

- **Auth:** handled by Better Auth. `middleware.ts` checks for the session cookie and redirects guests to `/login`. `modules/auth/session.ts` provides helpers for server components/actions.
- **Dashboard:** `/dashboard` aggregates communities + threads (TanStack Query hydrates live stats via `/api/threads`). Admins surface an extra CTA that links to `/dashboard/admin`.
- **Threads:** `/thread/[slug]` renders thread metadata, newsletter controls, and the live chat surface. Messages stream over the modular WebSocket layer and persist through server actions.
- **Newsletters:** every thread exposes a “Subscribe to newsletter” button. Subscribing schedules a digest (24h) and calling `POST /api/newsletter/generate` processes due digests via the AI summariser + fake mailer.
- **Admin:** `/dashboard/admin` ships shadcn forms for creating communities/threads and managing existing content (including delete).
- **Profile:** `/profile` shows a minimal user card plus admin-only quick actions.

## Testing & linting

```bash
npm run lint
npm run test
```

> Tip: seed local data with `npx prisma db seed`.