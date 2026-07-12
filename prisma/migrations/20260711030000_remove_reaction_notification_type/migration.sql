-- CreateEnum: Create new type without REACTION
CREATE TYPE "NotificationType_new" AS ENUM ('REPLY', 'MENTION', 'INVITATION', 'SYSTEM', 'AI_INSIGHT');

-- Migrate data: Update any existing REACTION notifications to SYSTEM (should be zero rows)
UPDATE "notifications" SET "type" = 'SYSTEM' WHERE "type" = 'REACTION';

-- AlterColumn: Change column to use new type
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING "type"::text::"NotificationType_new";

-- DropEnum: Drop old type
DROP TYPE "NotificationType";

-- Rename: Rename new type to old name
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
