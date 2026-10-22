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
  --build-arg NEXT_PUBLIC_SENTRY_DSN=https://public@o0.ingest.sentry.io/0 \
  --build-arg SENTRY_ORG=your-org \
  --build-arg SENTRY_PROJECT=your-project \
  --secret id=sentry_auth_token,src="$SENTRY_AUTH_TOKEN_FILE" \
  --target runner \
  -t sastram .
```

`SENTRY_AUTH_TOKEN` is mounted as a BuildKit secret for source-map upload; it
never becomes an image layer or build arg. Omit the `--secret` line to skip
source-map upload. `NEXT_PUBLIC_SENTRY_DSN` is public and must be a build arg
because Next inlines it into the browser bundle.

The build stage also needs placeholder values for required server env because
`prisma generate` and `next build` import the env schema. Never copy `.env` into
the image; the defaults in the Dockerfile are deliberately fake.

### Required runtime variables

See `.env.example`. The important production-only rules:

- `DATABASE_URL` must be the pooled Neon endpoint in production.
- `DATABASE_URL_UNPOOLED` must point at the direct endpoint for migrations.
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must both be HTTPS and match.
- `CRON_SECRET` must be set (32+ chars) or cron endpoints return 503.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are **required** in
  production: rate limits, quotas, spend caps, and caches need shared state.
  Without Redis, production rate limiting degrades to per-instance memory and
  AI spend/quota gates fail closed. Readiness reports `503`.
- `QSTASH_URL` and `QSTASH_TOKEN` must be set together. QStash signing keys
  must also be present, or boot fails instead of accepting jobs that can never
  be verified. `QSTASH_DEV` is rejected in production.
- OAuth client IDs and secrets must be present in pairs.
- `RESEND_*` template IDs are required.
- Content moderation defaults to **on** in production and requires the provider
  key selected by `AI_PROVIDER`. Without it readiness returns `503` and
  `check:prod` fails, so a load balancer cannot silently send traffic to an
  instance that only runs regex moderation. Image moderation fails closed: an
  NSFW or unverifiable (`UNKNOWN`) image is deleted before the upload succeeds.
  Uploads are limited per user and provider spend counts against the global AI
  cap. Set `CONTENT_MODERATION_ENABLED=false` only if you have an external
  moderation equivalent.

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

The readiness endpoint probes PostgreSQL, Redis, and AI configuration with a
750 ms timeout and a small per-IP rate limit. In production a missing Upstash
pair is reported as an error, not `not_configured`, because traffic must not be
routed to an instance without shared limits. Readiness is always `no-store`; a
load balancer must never act on a cached healthy result.

## 4. Scheduled jobs

Vercel schedules four jobs from `vercel.json`:

| Job | UTC | Purpose |
| --- | --- | --- |
| `update-threads` | 03:00 | AI refresh, retention/purge, counter reconciliation |
| `cleanup-blobs` | 04:00 | Delete orphaned uploads |
| `promote-knowledge` | 05:00 | Promote verified high-confidence threads |
| `daily-digest` | 09:00, 09:15, 09:30, 09:45 | Newsletter/digest delivery, paged with per-subscription checkpoints |

Every route under `/api/cron` requires `Authorization: Bearer $CRON_SECRET`.
Vercel sends this automatically when `CRON_SECRET` is configured. For another
scheduler, make the same request yourself.

`update-threads` also runs bounded retention before AI fan-out: expired Better
Auth sessions/verifications, expired AI-search cache/history, old invitations,
and read notifications older than 90 days. Soft-deleted users/threads are
hard-purged after 30 days.

`daily-digest` processes 100 subscriptions per page with a 45-second budget and
writes `lastAttemptedAt`/`lastSentAt`. The four 09:00 runs drain later pages
without resending earlier ones; a crashed worker leaves the short QStash
processing lease to expire so the delivery can be retried.

### Self-hosted scheduler

Docker Compose starts the app but does not include a scheduler. Run the same
jobs from host cron (or your orchestrator) with the production secret:

```cron
0 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sastram.example/api/cron/update-threads
0 4 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sastram.example/api/cron/cleanup-blobs
0 5 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sastram.example/api/cron/promote-knowledge
0,15,30,45 9 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sastram.example/api/cron/daily-digest
```

QStash delivers `/api/jobs` with an Upstash signature. `QSTASH_CURRENT_SIGNING_KEY`
and `QSTASH_NEXT_SIGNING_KEY` are required in production; the route fails closed
without them. Rotate the signing keys together with the publish credentials.

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
  `update-threads` cron. The same job removes expired sessions/verifications,
  expired AI-search cache/history, old invitations, and read notifications
  older than 90 days.
- Attachment rows use `ON DELETE SET NULL`, so hard-purging a thread leaves the
  blob cleanup record intact; `cleanup-blobs` then deletes the object.
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
