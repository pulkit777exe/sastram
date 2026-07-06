-- AlterTable: Add sectionId column to messages table
-- On this branch, Thread was renamed to Section. The messages table
-- still has the old threadId column. This migration adds sectionId
-- as a copy of threadId, then makes it required.

-- Step 1: Add sectionId as nullable
ALTER TABLE "messages" ADD COLUMN "sectionId" TEXT;

-- Step 2: Backfill sectionId from threadId (they map 1:1)
UPDATE "messages" SET "sectionId" = "threadId" WHERE "sectionId" IS NULL;

-- Step 3: Make sectionId NOT NULL
ALTER TABLE "messages" ALTER COLUMN "sectionId" SET NOT NULL;

-- Step 4: Add foreign key constraint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Add indexes
CREATE INDEX "messages_sectionId_idx" ON "messages"("sectionId");
CREATE INDEX "messages_sectionId_createdAt_idx" ON "messages"("sectionId", "createdAt");

-- Step 6: Drop old threadId column and its indexes/constraints
DROP INDEX IF EXISTS "messages_threadId_idx";
DROP INDEX IF EXISTS "messages_threadId_createdAt_idx";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_threadId_fkey";
ALTER TABLE "messages" DROP COLUMN "threadId";
