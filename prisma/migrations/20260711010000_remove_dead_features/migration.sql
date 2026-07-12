-- Remove dead features: UserBadge, UserBadgeEarned models
-- These tables were never written to or read from by runtime code.

-- Drop foreign key constraints first
ALTER TABLE "user_badges_earned" DROP CONSTRAINT IF EXISTS "user_badges_earned_userId_fkey";
ALTER TABLE "user_badges_earned" DROP CONSTRAINT IF EXISTS "user_badges_earned_badgeId_fkey";

-- Drop indexes
DROP INDEX IF EXISTS "user_badges_name_key";

-- Drop tables (order matters: child table first)
DROP TABLE IF EXISTS "user_badges_earned";
DROP TABLE IF EXISTS "user_badges";
