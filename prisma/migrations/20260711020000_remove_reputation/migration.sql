-- DropTable
DROP TABLE "user_reputation";

-- AlterTable: Remove reputationPoints from users
ALTER TABLE "users" DROP COLUMN "reputationPoints";
