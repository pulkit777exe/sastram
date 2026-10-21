# Deployment runbook

Sastram is a stateless Next.js app. All durable state lives in PostgreSQL,
Vercel Blob, Upstash Redis, and QStash; the app process can be replaced at any
time. This runbook covers the release path, probes, scheduled jobs, backups,
and rollback.

## 1. Build configuration

Server-only values are read at runtime. `NEXT_PUBLIC_*` values are embedded in
the client bundle during `next build`, so they must be correct **before** the
image is built.

Docker builds accept these build args (defaults are non-secret placeholders):

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://sastram.example \
  --target runner \
  -t sastram .
```

The build stage also needs placeholder values for required server env because
`prisma generate` and `next build` import the env schema. Never copy `.env` into
the image; the defaults in the Dockerfile are deliberately fake.

### Required runtime variables

See `.env.example`. The important production-only rules:

- `DATABASE_URL` must be the pooled Neon endpoint in production.
- `DATABASE_URL_UNPOOLED` must point at the direct endpoint for migrations.
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must both be HTTPS and match.
- `CRON_SECRET` must be set (32+ chars) or cron endpoints return 503.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` must be set together
  for shared rate limits, quotas, and caches. Without them the app falls back
  to per-process memory, which is only safe for a single instance.
- `QSTASH_URL` and `QSTASH_TOKEN` must be set together. QStash signing keys
  must also be present or `/api/jobs` rejects deliveries in production.
- OAuth client IDs and secrets must be present in pairs.
- `RESEND_*` template IDs are required.

`bun run check:prod` enforces these rules before a release.

## 2. Release order

Run migrations against the **direct** Neon endpoint before rolling out new app
code:

```bash
export DATABASE_URL_UNPOOLED=postgresql://...direct...
bun run db:deploy        # prisma migrate deploy
bun run db:extensions    # idempotent pg_trgm GIN indexes
```

On Vercel, run these from CI/a release job with `DATABASE_URL_UNPOOLED` set.
Prisma migrations are forward-only; never edit a migration that has already
run in production.

Docker Compose encodes the same order: the `migrate` service must complete
successfully before `app` starts.

```bash
docker compose up --build
```

## 3. Probes

| Endpoint | Purpose | Expected |
| --- | --- | --- |
| `GET /api/health/live` | Liveness / container restart | Always cheap, no DB or Redis calls, `200`, `no-store` |
| `GET /api/health` | Readiness / rotation | `200` when all configured services respond, `503` with `status: "degraded"` otherwise, `no-store` |

Use liveness for restart decisions. A transient database outage must remove an
instance from rotation, not restart it. Do not point a load balancer at
`/api/health` and then restart on failure.

The readiness endpoint probes PostgreSQL, Redis (when configured), and AI
configuration with a 750 ms timeout and a small per-IP rate limit.

## 4. Scheduled jobs

Vercel schedules four jobs from `vercel.json`:

| Job | UTC | Purpose |
| --- | --- | --- |
| `update-threads` | 03:00 | AI refresh, counter reconciliation, soft-delete purge |
| `cleanup-blobs` | 04:00 | Delete orphaned uploads |
| `promote-knowledge` | 05:00 | Promote verified high-confidence threads |
| `daily-digest` | 09:00 | Newsletter/digest delivery |

Every route under `/api/cron` requires `Authorization: Bearer $CRON_SECRET`.
Vercel sends this automatically when `CRON_SECRET` is configured. For another
scheduler, make the same request yourself.

QStash delivers `/api/jobs` with an Upstash signature. `QSTASH_CURRENT_SIGNING_KEY`
and `QSTASH_NEXT_SIGNING_KEY` are required in production; the route fails closed
without them.

## 5. Backups and recovery

- Enable Neon point-in-time restore on the production project and record the
  retention window in the team runbook.
- Take a logical backup before a risky migration:
  `pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --file=sastram-$(date +%F).dump`.
- Test a restore into a separate database at least quarterly.
- Blob storage is not covered by database backups. Treat uploads as
  reproducible/user-provided content, and verify Blob retention semantics
  before relying on it for anything durable.

### Rollback

1. Roll back the application to the previous image/deployment first.
2. Do **not** roll back the database schema by reverting migration files.
3. If a migration caused data corruption, restore the pre-migration snapshot
   or apply a forward fix migration. Prisma has no automatic down migrations.

## 6. Security and privacy operations

- Security headers, including the nonce-based CSP, are applied in `proxy.ts`.
  Keep that the single source of truth for CSP.
- Sentry runs with restrictive data collection: cookies, headers, request
  bodies, query strings, LLM payloads, database rows, and stack-frame variables
  are disabled. Error events still strip request PII as defence in depth.
- Logs pass through `lib/infrastructure/logger.ts`, which masks email addresses
  and redacts secret-looking keys. Never bypass it with raw `console.*` in app
  code.
- Soft-deleted users and threads are purged after 30 days by the
  `update-threads` cron.
- Rotate `BETTER_AUTH_SECRET`, `CRON_SECRET`, OAuth secrets, Resend, QStash, and
  Upstash credentials by deploying the new value first where the provider
  supports overlaps, then removing the old one.

## 7. Release checklist

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run test:e2e` when UI flows changed
- [ ] `bun run build`
- [ ] `NODE_ENV=production bun run check:prod`
- [ ] `bun run audit:gate`
- [ ] Migrations applied to the direct database endpoint
- [ ] `/api/health/live` returns 200 on the new instance
- [ ] `/api/health` returns 200 (or an understood degraded state)
- [ ] Sentry release/source maps uploaded, if configured
