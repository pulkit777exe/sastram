-- Perf hot-path indexes (2026-10-14).
--
-- Authored offline (no live DB in this environment): every statement below is
-- a plain CREATE/DROP INDEX matched 1:1 with prisma/schema.prisma, so
-- `prisma migrate dev` replays it deterministically. Apply with:
--   bun db:migrate            # dev (Neon pooled URL)
--   prisma migrate deploy     # prod
-- Verify after apply with EXPLAIN on the cited queries, e.g.:
--   EXPLAIN SELECT "id" FROM "threads"
--   WHERE "deletedAt" IS NULL AND "visibility" = 'PUBLIC'
--   ORDER BY "updatedAt" DESC LIMIT 20;
--
-- Convention: plain DROP INDEX IF EXISTS (not CONCURRENTLY — Prisma runs
-- migrations in a transaction). Sub-millisecond lock on deploy; indexes are
-- small relative to table scans they replace.

-- pg_trgm for ILIKE '%term%' search (modules/search/repository.ts builds
-- OR-of-contains across these columns; btree cannot serve leading-%).
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX IF NOT EXISTS "threads_name_trgm_idx" ON "threads" USING gin ("name" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "threads_description_trgm_idx" ON "threads" USING gin ("description" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "threads_aiSummary_trgm_idx" ON "threads" USING gin ("aiSummary" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "messages_content_trgm_idx" ON "messages" USING gin ("content" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "users_bio_trgm_idx" ON "users" USING gin ("bio" "gin_trgm_ops");

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
DROP INDEX IF EXISTS "messages_threadId_idx";
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
