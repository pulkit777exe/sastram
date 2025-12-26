-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "github" TEXT,
ADD COLUMN     "linkedin" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "preferences" JSONB DEFAULT '{}',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "user_bans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "customReason" TEXT,
    "threadId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_bans_userId_idx" ON "user_bans"("userId");

-- CreateIndex
CREATE INDEX "user_bans_bannedBy_idx" ON "user_bans"("bannedBy");

-- CreateIndex
CREATE INDEX "user_bans_threadId_idx" ON "user_bans"("threadId");

-- AddForeignKey
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_bannedBy_fkey" FOREIGN KEY ("bannedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
