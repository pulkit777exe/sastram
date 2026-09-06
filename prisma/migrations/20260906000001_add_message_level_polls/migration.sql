-- Pending migration: message-level polls (from pending_20260720_message_level_polls.sql)
-- Folded into history as a proper migration so db:deploy applies it.

-- 1. Convert the unique threadId constraint into a plain index.
DROP INDEX IF EXISTS "polls_threadId_key";
CREATE INDEX IF NOT EXISTS "polls_threadId_idx" ON "polls"("threadId");

-- 2. Add the messageId column (nullable).
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "messageId" TEXT;

-- 3. Unique constraint: at most one poll per message.
CREATE UNIQUE INDEX IF NOT EXISTS "polls_messageId_key" ON "polls"("messageId");

-- 4. Foreign key to messages, cascade delete.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polls_messageId_fkey') THEN
    ALTER TABLE "polls"
      ADD CONSTRAINT "polls_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "messages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
