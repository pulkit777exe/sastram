-- Perf hot-path indexes (2026-10-14).
--
-- Btree composites this migration adds (all expressible in schema.prisma,
-- so `migrate dev`/`deploy` stays drift-free):
--   threads[deletedAt,visibility,updatedAt], threads[deletedAt,messageCount],
--   notifications[userId,isRead,type], reports[status,category] +
--   [status,updatedAt], appeals[userId,status],
--   user_bans[userId,isActive,threadId] (widens, covers findActiveBan),
--   thread_invitations[email], polls[isMarket,threadId].
--
-- pg_trgm GIN indexes for ILIKE search are NOT here: Prisma cannot express
-- GIN opclasses, so including them makes every future `migrate dev` see
-- phantom drift and prompt for a new migration. They live in
-- prisma/extensions/pg-trgm.sql (idempotent) — apply once per database:
--   psql "$DATABASE_URL_UNPOOLED" -f prisma/extensions/pg-trgm.sql
-- (Neon supports pg_trgm; the script is safe to re-run.)
--
-- Apply with:
--   bun db:migrate            # dev (Neon pooled URL; config derives direct)
--   prisma migrate deploy     # prod
-- Verify after apply with EXPLAIN, e.g.:
--   EXPLAIN SELECT "id" FROM "threads"
--   WHERE "deletedAt" IS NULL AND "visibility" = 'PUBLIC'
--   ORDER BY "updatedAt" DESC LIMIT 20;
--
-- Convention: plain DROP INDEX IF EXISTS (not CONCURRENTLY — Prisma runs
-- migrations in a transaction). Sub-millisecond lock on deploy; indexes are
-- small relative to the table scans they replace.

-- Feed: WHERE deletedAt IS NULL + visibility filter + ORDER BY / sort.
CREATE INDEX IF NOT EXISTS "threads_deletedAt_visibility_updatedAt_idx" ON "threads"("deletedAt", "visibility", "updatedAt");
CREATE INDEX IF NOT EXISTS "threads_deletedAt_messageCount_idx" ON "threads"("deletedAt", "messageCount");

-- Notification center: WHERE userId (+isRead +type) ORDER BY createdAt DESC.
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_type_idx" ON "notifications"("userId", "isRead", "type");

-- Moderation stats: GROUP BY category WHERE status, counts WHERE status + updatedAt.
CREATE INDEX IF NOT EXISTS "reports_status_category_idx" ON "reports"("status", "category");
CREATE INDEX IF NOT EXISTS "reports_status_updatedAt_idx" ON "reports"("status", "updatedAt");

-- Appeals: pending-appeal lookup WHERE userId + status.
CREATE INDEX IF NOT EXISTS "appeals_userId_status_idx" ON "appeals"("userId", "status");

-- Access gate: findActiveBan WHERE userId + isActive + threadId (site-wide NULL included).
CREATE INDEX IF NOT EXISTS "user_bans_userId_isActive_threadId_idx" ON "user_bans"("userId", "isActive", "threadId");

-- Invitations: exportUserData lookup WHERE email (unique [threadId,email] cannot serve it).
CREATE INDEX IF NOT EXISTS "thread_invitations_email_idx" ON "thread_invitations"("email");

-- Poll markets: getMarketPolls WHERE isMarket (+threadId).
CREATE INDEX IF NOT EXISTS "polls_isMarket_threadId_idx" ON "polls"("isMarket", "threadId");

-- Redundant leftmost-prefix singles (identical plans via the covering
-- unique/composite; each removed index is one fewer write per insert).
-- messages_parentId_idx is pre-existing drift: created by an old migration,
-- absent from schema.prisma for a while, covered by [parentId,threadId].
DROP INDEX IF EXISTS "messages_threadId_idx";
DROP INDEX IF EXISTS "messages_parentId_idx";
DROP INDEX IF EXISTS "reactions_messageId_idx";
DROP INDEX IF EXISTS "read_receipts_threadId_idx";
DROP INDEX IF EXISTS "user_follows_followerId_idx";
DROP INDEX IF EXISTS "user_bookmarks_userId_idx";
DROP INDEX IF EXISTS "thread_subscriptions_threadId_idx";
DROP INDEX IF EXISTS "appeal_votes_appealId_idx";
DROP INDEX IF EXISTS "polls_isMarket_idx";
DROP INDEX IF EXISTS "poll_votes_pollId_idx";
DROP INDEX IF EXISTS "collection_items_collectionId_idx";
DROP INDEX IF EXISTS "user_bans_userId_isActive_idx";
