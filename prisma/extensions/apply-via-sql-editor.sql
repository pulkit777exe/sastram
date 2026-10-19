-- One-shot payload for the Neon SQL Editor (HTTPS, no port 5432 needed).
-- Paste this entire file and run. Fully idempotent: safe to re-run,
-- and a later 'prisma migrate deploy' from a connected machine will
-- replay the same statements as no-ops while recording history.
-- Order matters: 2026-10-14 btree migration first, pg_trgm second, then the
-- 2026-10-19 owner-scoped indexes (as below).

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

-- ---- prisma/extensions/pg-trgm.sql ----

--   EXPLAIN SELECT id FROM threads WHERE name ILIKE '%test%';
-- (expect a Bitmap Index Scan on threads_name_trgm_idx)

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX IF NOT EXISTS "threads_name_trgm_idx" ON "threads" USING gin ("name" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "threads_description_trgm_idx" ON "threads" USING gin ("description" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "threads_aiSummary_trgm_idx" ON "threads" USING gin ("aiSummary" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "messages_content_trgm_idx" ON "messages" USING gin ("content" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "users_bio_trgm_idx" ON "users" USING gin ("bio" "gin_trgm_ops");

-- ---- Perf owner-scoped indexes + redundant-single cleanup (2026-10-19) ----
--
-- Mirror of prisma/migrations/20261019000000_perf_owner_indexes: 7 composites
-- for owner-scoped ORDER BY createdAt lists + the global feed; 11 redundant
-- singles dropped (each covered by a unique or a new composite). Creates run
-- before drops so no lookup loses its index mid-apply.

CREATE INDEX IF NOT EXISTS "threads_deletedAt_updatedAt_idx" ON "threads"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "threads_createdBy_createdAt_idx" ON "threads"("createdBy", "createdAt");
CREATE INDEX IF NOT EXISTS "messages_senderId_createdAt_idx" ON "messages"("senderId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_follows_followerId_createdAt_idx" ON "user_follows"("followerId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_follows_followingId_createdAt_idx" ON "user_follows"("followingId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_bookmarks_userId_createdAt_idx" ON "user_bookmarks"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_search_sessions_userId_createdAt_idx" ON "ai_search_sessions"("userId", "createdAt");

DROP INDEX IF EXISTS "users_email_idx";
DROP INDEX IF EXISTS "sessions_token_idx";
DROP INDEX IF EXISTS "verifications_identifier_idx";
DROP INDEX IF EXISTS "threads_slug_idx";
DROP INDEX IF EXISTS "thread_tags_slug_idx";
DROP INDEX IF EXISTS "thread_invitations_token_idx";
DROP INDEX IF EXISTS "knowledge_pages_threadId_idx";
DROP INDEX IF EXISTS "threads_createdBy_idx";
DROP INDEX IF EXISTS "messages_senderId_idx";
DROP INDEX IF EXISTS "user_follows_followingId_idx";
DROP INDEX IF EXISTS "ai_search_sessions_userId_idx";
