-- Add factCheckStatus to messages for AI Fact-Check Badge
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "factCheckStatus" TEXT NOT NULL DEFAULT 'unchecked';
