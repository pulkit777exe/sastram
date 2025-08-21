# Sastram

Community-driven forum with AI-assisted daily digests across Technology, Gaming, General, and Sports.

## Features

- Sections with posting UI and modern layout
- Newsletter subscriptions per section
- PostgreSQL database with Drizzle ORM
- Daily digest builder with AI summarization
- Automated daily processing via Vercel Cron
- CI (GitHub Actions), Docker (dev and prod), and Husky pre-commit hooks

## Getting started

### Prerequisites
- Node.js 22+
- npm 10+
- PostgreSQL database (Neon, Supabase, or self-hosted)

### Database Setup

1. Create a PostgreSQL database (recommended: [Neon](https://neon.tech) or [Supabase](https://supabase.com))
2. Copy environment variables:
```bash
cp env.example .env.local
```
3. Update `NEXT_PUBLIC_DATABASE_URL` in `.env.local` with your PostgreSQL connection string
4. Generate and run database migrations:
```bash
npm run db:generate
npm run db:migrate
```
5. Migrate existing data (if any):
```bash
npx tsx lib/db/migrate.ts
```

### Install and run

```bash
npm ci
npm run dev
```

Visit `http://localhost:3000`.

### Build and start prod

```bash
npm run build
npm run start
```

## Docker

### Development (hot reload)

```bash
docker compose up --build app
```

- App: `http://localhost:3000`
- Mounts project files into the container

### Production

```bash
docker compose --profile prod up --build prod
```

- Runs multi-stage Dockerfile build and serves optimized app

## API overview

- `POST /api/posts` — create post `{ section, title, content, author }`
- `GET /api/posts?section=technology` — list posts (optionally by section)
- `POST /api/subscribe` — subscribe `{ email, sections: string[] }`
- `GET /api/digest` — preview latest digest
- `POST /api/digest` — build and save digest with AI summary
- `POST /api/cron/daily-digest` — daily cron endpoint (automated)

## Database Schema

- `posts` — forum posts with section, title, content, author
- `subscribers` — newsletter subscribers with email and sections
- `daily_digests` — processed digests with AI summaries and sent status

## Project structure

- `app/` — Next.js routes and components
  - `section/[section]/` — section page, composer, loading state
  - `newsletter/` — subscription form and digest preview
  - `api/` — posts, subscribe, digest, cron routes
- `lib/`
  - `shared.ts` — client-safe constants and types
  - `db/` — database schema, connection, and queries
  - `store.ts` — re-exports database functions for compatibility
- `drizzle/` — generated migrations

## Daily AI Processing

The system automatically processes daily digests at 6 PM UTC via Vercel Cron:

1. Collects posts from the last 24 hours
2. Categorizes them (jobs, launches, news, etc.)
3. Generates AI summary (currently rule-based, can be enhanced with OpenAI/Anthropic)
4. Saves to database with metadata
5. Ready for email distribution to subscribers

### Manual Processing

Trigger digest processing manually:
```bash
curl -X POST https://sastram.vercel.app/api/cron/daily-digest
```

## Contributing

We welcome issues and PRs!

1. Fork and clone
2. Create a feature branch
3. Enable hooks: `npx husky init` (or run the script below)
4. Commit with lint/typecheck passing
5. Open a PR

### Local checks

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
```

## Husky

A pre-commit hook runs lint and typecheck. If Husky is not active locally, run:

```bash
npx husky init
chmod +x .husky/pre-commit
```

## CI

GitHub Actions workflow `ci.yml` runs on pushes and PRs:
- Install deps, lint, typecheck, and build

## Database Management

- View data: `npm run db:studio`
- Generate migrations: `npm run db:generate`
- Run migrations: `npm run db:migrate`

## Roadmap

- Enhanced AI summaries with OpenAI/Anthropic
- Email delivery integration (Resend, SendGrid)
- Auth and user roles
- Real-time notifications
- Advanced analytics

## License

MIT
