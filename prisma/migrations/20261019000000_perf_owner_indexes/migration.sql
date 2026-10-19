-- Perf owner-scoped indexes + redundant-single cleanup (2026-10-19).
--
-- Generated offline with (Prisma 7 renamed the flags from
-- --from-schema-datamodel/--to-schema-datamodel to --from-schema/--to-schema):
--   prisma migrate diff --from-schema <HEAD schema> --to-schema schema.prisma --script
-- Contains only CREATE/DROP INDEX statements; no table or column changes.
--
-- Created (7):
--   threads[deletedAt,updatedAt] — thread feed: WHERE deletedAt IS NULL AND
--     (visibility OR creator OR invited) ORDER BY updatedAt DESC. The existing
--     [visibility,updatedAt] and [deletedAt,visibility,updatedAt] composites
--     cannot serve a global updatedAt order through an OR filter; this index
--     gives an ordered scan with the OR applied as a filter (threads page,
--     GET /api/threads, admin page).
--   threads[createdBy,createdAt], messages[senderId,createdAt],
--   user_follows[followerId,createdAt], user_follows[followingId,createdAt],
--   user_bookmarks[userId,createdAt], ai_search_sessions[userId,createdAt]
--     — owner-scoped paginated lists all sort ORDER BY createdAt DESC; a
--     single-column owner index cannot order by createdAt.
--
-- Dropped (11) — every drop is either a redundant duplicate of an existing
-- unique/leftmost-unique column, or a single replaced by one of the new
-- composites (identical leftmost prefix, so every equality/prefix lookup
-- keeps an index):
--   users_email_idx               redundant with users.email @unique
--   sessions_token_idx            redundant with sessions.token @unique
--   verifications_identifier_idx  redundant leftmost prefix of @@unique([identifier, value])
--   threads_slug_idx              redundant with threads.slug @unique
--   thread_tags_slug_idx          redundant with thread_tags.slug @unique
--   thread_invitations_token_idx  redundant with thread_invitations.token @unique
--   knowledge_pages_threadId_idx  redundant with knowledge_pages.threadId @unique
--   threads_createdBy_idx         → threads_createdBy_createdAt_idx
--   messages_senderId_idx         → messages_senderId_createdAt_idx
--   user_follows_followingId_idx  → user_follows_followingId_createdAt_idx
--   ai_search_sessions_userId_idx → ai_search_sessions_userId_createdAt_idx
--
-- Convention: DROP INDEX IF EXISTS / CREATE INDEX IF NOT EXISTS (not
-- CONCURRENTLY — Prisma runs migrations in a transaction). Idempotent form so
-- a database that already applied the same DDL through
-- prisma/extensions/apply-via-sql-editor.sql replays this file as no-ops
-- while recording history. Each dropped index is immediately covered by an
-- existing unique or a composite created below.

-- Redundant singles duplicating a unique/leftmost-unique column.
DROP INDEX IF EXISTS "users_email_idx";
DROP INDEX IF EXISTS "sessions_token_idx";
DROP INDEX IF EXISTS "verifications_identifier_idx";
DROP INDEX IF EXISTS "threads_slug_idx";
DROP INDEX IF EXISTS "thread_tags_slug_idx";
DROP INDEX IF EXISTS "thread_invitations_token_idx";
DROP INDEX IF EXISTS "knowledge_pages_threadId_idx";

-- Singles replaced by (owner, createdAt) composites below.
DROP INDEX IF EXISTS "threads_createdBy_idx";
DROP INDEX IF EXISTS "messages_senderId_idx";
DROP INDEX IF EXISTS "user_follows_followingId_idx";
DROP INDEX IF EXISTS "ai_search_sessions_userId_idx";

-- Feed: ordered scan for the OR visibility/creator/invited filter.
CREATE INDEX IF NOT EXISTS "threads_deletedAt_updatedAt_idx" ON "threads"("deletedAt", "updatedAt");

-- Owner-scoped paginated lists: WHERE owner = $1 ORDER BY createdAt DESC.
CREATE INDEX IF NOT EXISTS "threads_createdBy_createdAt_idx" ON "threads"("createdBy", "createdAt");
CREATE INDEX IF NOT EXISTS "messages_senderId_createdAt_idx" ON "messages"("senderId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_follows_followerId_createdAt_idx" ON "user_follows"("followerId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_follows_followingId_createdAt_idx" ON "user_follows"("followingId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_bookmarks_userId_createdAt_idx" ON "user_bookmarks"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_search_sessions_userId_createdAt_idx" ON "ai_search_sessions"("userId", "createdAt");
