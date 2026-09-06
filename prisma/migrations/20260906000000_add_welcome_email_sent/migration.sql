-- Create missing enums for feedback (not in initial migration)
DO $$ BEGIN
  CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'SUGGESTION', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REVIEWED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add welcomeEmailSent column to users if not exists (was added to schema but no migration generated)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "welcomeEmailSent" BOOLEAN NOT NULL DEFAULT false;

-- Add deletedAt for soft-delete (users)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Add missing columns to ai_search_sessions (added via db push, not migration)
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "parentSessionId" TEXT;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "classifyMs" INTEGER;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "searchMs" INTEGER;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "crossrefMs" INTEGER;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "synthesizeMs" INTEGER;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "ai_search_sessions" ADD COLUMN IF NOT EXISTS "tokenCostUsd" DOUBLE PRECISION;

-- Create ai_usage_logs if not exists
CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_usage_logs_userId_idx" ON "ai_usage_logs"("userId");
CREATE INDEX IF NOT EXISTS "ai_usage_logs_operation_idx" ON "ai_usage_logs"("operation");
CREATE INDEX IF NOT EXISTS "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_logs_costUsd_idx" ON "ai_usage_logs"("costUsd");

-- Create feedback if not exists
CREATE TABLE IF NOT EXISTS "feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "FeedbackType" NOT NULL,
    "message" TEXT NOT NULL,
    "route" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "feedback_userId_idx" ON "feedback"("userId");
CREATE INDEX IF NOT EXISTS "feedback_status_idx" ON "feedback"("status");
CREATE INDEX IF NOT EXISTS "feedback_type_idx" ON "feedback"("type");
CREATE INDEX IF NOT EXISTS "feedback_createdAt_idx" ON "feedback"("createdAt");

-- Indexes for new ai_search_sessions columns
CREATE INDEX IF NOT EXISTS "ai_search_sessions_parentSessionId_idx" ON "ai_search_sessions"("parentSessionId");
CREATE INDEX IF NOT EXISTS "ai_search_sessions_deletedAt_idx" ON "ai_search_sessions"("deletedAt");

-- Foreign key for parentSessionId (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_search_sessions_parentSessionId_fkey') THEN
    ALTER TABLE "ai_search_sessions" ADD CONSTRAINT "ai_search_sessions_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "ai_search_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Additional indexes for users
CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON "users"("deletedAt");
