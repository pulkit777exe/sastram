/*
  Warnings:

  - Added the required column `citations` to the `ai_search_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `followUps` to the `ai_search_results` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "AttachmentType" ADD VALUE 'PDF';

-- DropForeignKey
ALTER TABLE "appeals" DROP CONSTRAINT "appeals_userId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_senderId_fkey";

-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_reporterId_fkey";

-- DropForeignKey
ALTER TABLE "threads" DROP CONSTRAINT "threads_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "user_bans" DROP CONSTRAINT "user_bans_bannedBy_fkey";

-- DropForeignKey
ALTER TABLE "user_bans" DROP CONSTRAINT "user_bans_userId_fkey";

-- AlterTable
ALTER TABLE "ai_search_results" ADD COLUMN     "citations" JSONB NOT NULL,
ADD COLUMN     "followUps" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "senderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ALTER COLUMN "reporterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "thread_subscriptions" ALTER COLUMN "frequency" SET DEFAULT 'DAILY';

-- AlterTable
ALTER TABLE "threads" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "user_bans" ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "bannedBy" DROP NOT NULL;

-- DropEnum
DROP TYPE "CommunityVisibility";

-- DropEnum
DROP TYPE "MemberStatus";

-- DropEnum
DROP TYPE "ThreadRole";

-- CreateTable
CREATE TABLE "knowledge_pages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "synthesizedContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_pages_threadId_key" ON "knowledge_pages"("threadId");

-- CreateIndex
CREATE INDEX "knowledge_pages_threadId_idx" ON "knowledge_pages"("threadId");

-- CreateIndex
CREATE INDEX "ai_search_results_sessionId_idx" ON "ai_search_results"("sessionId");

-- CreateIndex
CREATE INDEX "messages_threadId_senderId_createdAt_idx" ON "messages"("threadId", "senderId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_deletedAt_idx" ON "messages"("deletedAt");

-- CreateIndex
CREATE INDEX "messages_threadId_deletedAt_createdAt_idx" ON "messages"("threadId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "user_activities_userId_type_createdAt_idx" ON "user_activities"("userId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_bannedBy_fkey" FOREIGN KEY ("bannedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_pages" ADD CONSTRAINT "knowledge_pages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
