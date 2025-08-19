# Cortex Forum

Community-driven forum with AI-assisted daily digests across Technology, Gaming, General, and Sports.

## Features

- Sections with posting UI and modern layout
- Newsletter subscriptions per section
- Daily digest builder that categorizes notable posts (jobs, launches, news)
- File-based storage for quick local development
- CI (GitHub Actions), Docker (dev and prod), and Husky pre-commit hooks

## Getting started

### Prerequisites
- Node.js 22+
- npm 10+

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
- `GET /api/digest` — preview last 24h digest
- `POST /api/digest` — build and save last 24h digest file under `data/newsletters/`

## Project structure

- `app/` — Next.js routes and components
  - `section/[section]/` — section page, composer, loading state
  - `newsletter/` — subscription form and digest preview
  - `api/` — posts, subscribe, digest routes
- `lib/`
  - `shared.ts` — client-safe constants and types
  - `store.ts` — server-side file storage and digest helpers
- `data/` — created at runtime for posts, subscribers, digests

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

## Daily digest scheduling

Use a cron (e.g., Vercel Cron or GitHub Actions) to call `POST /api/digest` daily. You can then email the JSON file contents to subscribers using your provider of choice (Resend, SMTP).

## Roadmap

- Persist to a database (SQLite/Postgres)
- Email delivery integration
- Auth and roles
- AI summarization enrichment per section

## License

MIT


