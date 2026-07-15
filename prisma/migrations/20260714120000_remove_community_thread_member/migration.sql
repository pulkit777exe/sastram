-- Remove Community and ThreadMember; flatten to global thread access model

-- Drop foreign key and column from threads
ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_communityId_fkey";
DROP INDEX IF EXISTS "threads_communityId_idx";
DROP INDEX IF EXISTS "threads_visibility_communityId_updatedAt_idx";
ALTER TABLE "threads" DROP COLUMN IF EXISTS "communityId";

-- Drop thread_members table
DROP TABLE IF EXISTS "thread_members";

-- Drop communities table
DROP TABLE IF EXISTS "communities";

-- Add replacement index for visibility queries
CREATE INDEX IF NOT EXISTS "threads_visibility_updatedAt_idx" ON "threads"("visibility", "updatedAt");
