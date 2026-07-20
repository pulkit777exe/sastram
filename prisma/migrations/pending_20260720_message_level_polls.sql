-- Pending migration: message-level polls (feature work, 2026-07-20)
--
-- This SQL is NOT auto-applied. `prisma migrate dev` currently refuses to
-- generate or apply because the committed migration history has drifted from
-- the live Neon DB (see docs/BACKLOG.md — the 20260712000200 baseline migration
-- was previously broken SQL and the DB was last synced via `prisma db push`,
-- which writes no history row). Running `migrate dev` demands a destructive
-- `migrate reset` (drops all data). Apply this file manually after reconciling
-- the migration history, or fold it into the history-reconciliation migration.
--
-- What it does (scoped to the polls model change only):
--   * threadId is no longer unique — a thread may have many polls (one per
--     message). The old unique index becomes a plain lookup index.
--   * messageId (nullable, unique) links a poll to the message that owns it.
--     NULL messageId = legacy thread-level poll (still rendered via PollPanel).
--   * FK on messageId -> messages.id ON DELETE CASCADE (deleting a message
--     deletes its poll), matching the schema's onDelete: Cascade.

-- 1. Convert the unique threadId constraint into a plain index.
DROP INDEX CONCURRENTLY IF EXISTS "polls_threadId_key";
CREATE INDEX IF NOT EXISTS "polls_threadId_idx" ON "polls"("threadId");

-- 2. Add the messageId column (nullable).
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "messageId" TEXT;

-- 3. Unique constraint: at most one poll per message.
CREATE UNIQUE INDEX IF NOT EXISTS "polls_messageId_key" ON "polls"("messageId");

-- 4. Foreign key to messages, cascade delete.
ALTER TABLE "polls"
  ADD CONSTRAINT "polls_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
