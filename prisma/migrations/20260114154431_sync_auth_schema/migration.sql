/*
  Warnings:

  - A unique constraint covering the columns `[token]` on the table `thread_invitations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `newsletter_subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateEnum
CREATE TYPE "SectionVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "SectionRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE', 'REPLY', 'MENTION', 'REACTION', 'INVITATION', 'DIGEST', 'REPORT', 'BAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_BANNED', 'USER_UNBANNED', 'MESSAGE_CREATED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'SECTION_CREATED', 'SECTION_UPDATED', 'SECTION_DELETED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'REPORT_CREATED', 'REPORT_RESOLVED');

-- CreateEnum
CREATE TYPE "ProfilePrivacy" AS ENUM ('PUBLIC', 'PRIVATE', 'FOLLOWERS_ONLY');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('QUEUED', 'FLAGGED', 'BLOCKED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModerationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('ALLOW', 'FLAG', 'BLOCK', 'REVIEW');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "ModerationDecision" AS ENUM ('APPROVE', 'REJECT', 'ESCALATE');

-- CreateEnum
CREATE TYPE "ModerationLogAction" AS ENUM ('MESSAGE_ALLOWED', 'MESSAGE_FLAGGED', 'MESSAGE_BLOCKED', 'APPEAL_SUBMITTED', 'APPEAL_APPROVED', 'APPEAL_DENIED', 'USER_BANNED', 'USER_UNBANNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentType" ADD VALUE 'VIDEO';
ALTER TYPE "AttachmentType" ADD VALUE 'AUDIO';

-- AlterEnum
ALTER TYPE "InvitationStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MODERATOR';

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "mimeType" TEXT,
ALTER COLUMN "size" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "communities" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "settings" JSONB DEFAULT '{}',
ADD COLUMN     "visibility" "CommunityVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "newsletter_subscriptions" ADD COLUMN     "frequency" "DigestFrequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "details" TEXT,
ADD COLUMN     "resolution" TEXT;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "memberCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settings" JSONB DEFAULT '{}',
ADD COLUMN     "visibility" "SectionVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "thread_invitations" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "token" TEXT;

-- AlterTable
ALTER TABLE "user_bans" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "followerCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "followingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "profilePrivacy" "ProfilePrivacy" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "reputationPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "section_members" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SectionRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_edits" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_mentions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "read_receipts" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mentionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repliesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "performedBy" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_tag_relations" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_tag_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_reputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges_earned" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_earned_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_safety_rules" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "ModerationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "action" "ModerationAction" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_safety_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_queue" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "context" JSONB,
    "flaggedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT,
    "queueId" TEXT,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_feedback" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "decision" "ModerationDecision" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_stats" (
    "id" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3),
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "allowedCount" INTEGER NOT NULL DEFAULT 0,
    "falsePositiveCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_action_log" (
    "id" TEXT NOT NULL,
    "action" "ModerationLogAction" NOT NULL,
    "messageId" TEXT,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_action_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "section_members_sectionId_idx" ON "section_members"("sectionId");

-- CreateIndex
CREATE INDEX "section_members_userId_idx" ON "section_members"("userId");

-- CreateIndex
CREATE INDEX "section_members_role_idx" ON "section_members"("role");

-- CreateIndex
CREATE UNIQUE INDEX "section_members_sectionId_userId_key" ON "section_members"("sectionId", "userId");

-- CreateIndex
CREATE INDEX "message_edits_messageId_idx" ON "message_edits"("messageId");

-- CreateIndex
CREATE INDEX "message_mentions_userId_idx" ON "message_mentions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "message_mentions_messageId_userId_key" ON "message_mentions"("messageId", "userId");

-- CreateIndex
CREATE INDEX "reactions_messageId_idx" ON "reactions"("messageId");

-- CreateIndex
CREATE INDEX "reactions_userId_idx" ON "reactions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_messageId_userId_emoji_key" ON "reactions"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "read_receipts_userId_idx" ON "read_receipts"("userId");

-- CreateIndex
CREATE INDEX "read_receipts_lastReadAt_idx" ON "read_receipts"("lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "read_receipts_sectionId_userId_key" ON "read_receipts"("sectionId", "userId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notification_settings_userId_idx" ON "notification_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_userId_sectionId_key" ON "notification_settings"("userId", "sectionId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_performedBy_idx" ON "audit_logs"("performedBy");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "user_follows_followerId_idx" ON "user_follows"("followerId");

-- CreateIndex
CREATE INDEX "user_follows_followingId_idx" ON "user_follows"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "user_follows_followerId_followingId_key" ON "user_follows"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "user_bookmarks_userId_idx" ON "user_bookmarks"("userId");

-- CreateIndex
CREATE INDEX "user_bookmarks_threadId_idx" ON "user_bookmarks"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "user_bookmarks_userId_threadId_key" ON "user_bookmarks"("userId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "thread_tags_slug_key" ON "thread_tags"("slug");

-- CreateIndex
CREATE INDEX "thread_tags_slug_idx" ON "thread_tags"("slug");

-- CreateIndex
CREATE INDEX "thread_tag_relations_threadId_idx" ON "thread_tag_relations"("threadId");

-- CreateIndex
CREATE INDEX "thread_tag_relations_tagId_idx" ON "thread_tag_relations"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "thread_tag_relations_threadId_tagId_key" ON "thread_tag_relations"("threadId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "polls_threadId_key" ON "polls"("threadId");

-- CreateIndex
CREATE INDEX "polls_threadId_idx" ON "polls"("threadId");

-- CreateIndex
CREATE INDEX "polls_isActive_idx" ON "polls"("isActive");

-- CreateIndex
CREATE INDEX "poll_votes_pollId_idx" ON "poll_votes"("pollId");

-- CreateIndex
CREATE INDEX "poll_votes_userId_idx" ON "poll_votes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_pollId_userId_key" ON "poll_votes"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_reputation_userId_key" ON "user_reputation"("userId");

-- CreateIndex
CREATE INDEX "user_reputation_points_idx" ON "user_reputation"("points");

-- CreateIndex
CREATE INDEX "user_reputation_level_idx" ON "user_reputation"("level");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_name_key" ON "user_badges"("name");

-- CreateIndex
CREATE INDEX "user_badges_name_idx" ON "user_badges"("name");

-- CreateIndex
CREATE INDEX "user_badges_earned_userId_idx" ON "user_badges_earned"("userId");

-- CreateIndex
CREATE INDEX "user_badges_earned_badgeId_idx" ON "user_badges_earned"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_earned_userId_badgeId_key" ON "user_badges_earned"("userId", "badgeId");

-- CreateIndex
CREATE INDEX "user_activities_userId_idx" ON "user_activities"("userId");

-- CreateIndex
CREATE INDEX "user_activities_type_idx" ON "user_activities"("type");

-- CreateIndex
CREATE INDEX "user_activities_createdAt_idx" ON "user_activities"("createdAt");

-- CreateIndex
CREATE INDEX "user_activities_entityType_entityId_idx" ON "user_activities"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "content_safety_rules_category_idx" ON "content_safety_rules"("category");

-- CreateIndex
CREATE INDEX "content_safety_rules_severity_idx" ON "content_safety_rules"("severity");

-- CreateIndex
CREATE INDEX "content_safety_rules_createdBy_idx" ON "content_safety_rules"("createdBy");

-- CreateIndex
CREATE INDEX "moderation_queue_messageId_idx" ON "moderation_queue"("messageId");

-- CreateIndex
CREATE INDEX "moderation_queue_status_idx" ON "moderation_queue"("status");

-- CreateIndex
CREATE INDEX "moderation_queue_reviewedBy_idx" ON "moderation_queue"("reviewedBy");

-- CreateIndex
CREATE INDEX "moderation_queue_createdAt_idx" ON "moderation_queue"("createdAt");

-- CreateIndex
CREATE INDEX "moderation_queue_status_createdAt_idx" ON "moderation_queue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "appeals_messageId_idx" ON "appeals"("messageId");

-- CreateIndex
CREATE INDEX "appeals_userId_idx" ON "appeals"("userId");

-- CreateIndex
CREATE INDEX "appeals_moderatorId_idx" ON "appeals"("moderatorId");

-- CreateIndex
CREATE INDEX "appeals_queueId_idx" ON "appeals"("queueId");

-- CreateIndex
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

-- CreateIndex
CREATE INDEX "appeals_createdAt_idx" ON "appeals"("createdAt");

-- CreateIndex
CREATE INDEX "moderation_feedback_queueId_idx" ON "moderation_feedback"("queueId");

-- CreateIndex
CREATE INDEX "moderation_feedback_moderatorId_idx" ON "moderation_feedback"("moderatorId");

-- CreateIndex
CREATE INDEX "moderation_feedback_decision_idx" ON "moderation_feedback"("decision");

-- CreateIndex
CREATE INDEX "moderation_stats_windowStart_idx" ON "moderation_stats"("windowStart");

-- CreateIndex
CREATE INDEX "moderation_stats_createdAt_idx" ON "moderation_stats"("createdAt");

-- CreateIndex
CREATE INDEX "moderation_action_log_action_idx" ON "moderation_action_log"("action");

-- CreateIndex
CREATE INDEX "moderation_action_log_messageId_idx" ON "moderation_action_log"("messageId");

-- CreateIndex
CREATE INDEX "moderation_action_log_actorId_idx" ON "moderation_action_log"("actorId");

-- CreateIndex
CREATE INDEX "moderation_action_log_targetUserId_idx" ON "moderation_action_log"("targetUserId");

-- CreateIndex
CREATE INDEX "moderation_action_log_createdAt_idx" ON "moderation_action_log"("createdAt");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "attachments_messageId_idx" ON "attachments"("messageId");

-- CreateIndex
CREATE INDEX "communities_slug_idx" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_visibility_idx" ON "communities"("visibility");

-- CreateIndex
CREATE INDEX "messages_sectionId_createdAt_idx" ON "messages"("sectionId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE INDEX "messages_deletedAt_idx" ON "messages"("deletedAt");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_threadId_idx" ON "newsletter_subscriptions"("threadId");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_userId_idx" ON "newsletter_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "sections_slug_idx" ON "sections"("slug");

-- CreateIndex
CREATE INDEX "sections_visibility_idx" ON "sections"("visibility");

-- CreateIndex
CREATE INDEX "sections_communityId_idx" ON "sections"("communityId");

-- CreateIndex
CREATE INDEX "sections_createdBy_idx" ON "sections"("createdBy");

-- CreateIndex
CREATE INDEX "sections_createdBy_createdAt_idx" ON "sections"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "thread_digests_status_idx" ON "thread_digests"("status");

-- CreateIndex
CREATE INDEX "thread_digests_scheduledFor_idx" ON "thread_digests"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "thread_invitations_token_key" ON "thread_invitations"("token");

-- CreateIndex
CREATE INDEX "thread_invitations_token_idx" ON "thread_invitations"("token");

-- CreateIndex
CREATE INDEX "user_bans_expiresAt_idx" ON "user_bans"("expiresAt");

-- CreateIndex
CREATE INDEX "user_bans_isActive_idx" ON "user_bans"("isActive");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_lastSeenAt_idx" ON "users"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "section_members" ADD CONSTRAINT "section_members_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_members" ADD CONSTRAINT "section_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_edits" ADD CONSTRAINT "message_edits_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_tag_relations" ADD CONSTRAINT "thread_tag_relations_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_tag_relations" ADD CONSTRAINT "thread_tag_relations_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "thread_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reputation" ADD CONSTRAINT "user_reputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges_earned" ADD CONSTRAINT "user_badges_earned_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges_earned" ADD CONSTRAINT "user_badges_earned_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "user_badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_safety_rules" ADD CONSTRAINT "content_safety_rules_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_queue" ADD CONSTRAINT "moderation_queue_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_queue" ADD CONSTRAINT "moderation_queue_flaggedBy_fkey" FOREIGN KEY ("flaggedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_queue" ADD CONSTRAINT "moderation_queue_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "moderation_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_feedback" ADD CONSTRAINT "moderation_feedback_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "moderation_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_feedback" ADD CONSTRAINT "moderation_feedback_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_action_log" ADD CONSTRAINT "moderation_action_log_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_action_log" ADD CONSTRAINT "moderation_action_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_action_log" ADD CONSTRAINT "moderation_action_log_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
