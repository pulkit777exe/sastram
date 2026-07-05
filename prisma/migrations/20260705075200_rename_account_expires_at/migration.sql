-- AlterTable
ALTER TABLE "accounts" RENAME COLUMN "expiresAt" TO "accessTokenExpiresAt";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "scope" TEXT;
