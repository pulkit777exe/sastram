-- Digest checkpoints so a timed-out run can resume without resending.
ALTER TABLE "thread_subscriptions" ADD COLUMN IF NOT EXISTS "lastAttemptedAt" TIMESTAMP(3);
ALTER TABLE "thread_subscriptions" ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "thread_subscriptions_isActive_lastAttemptedAt_idx"
  ON "thread_subscriptions" ("isActive", "lastAttemptedAt");
