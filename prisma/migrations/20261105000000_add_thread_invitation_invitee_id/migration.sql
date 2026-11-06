-- Bind accepting users to their thread invitations so access survives
-- email changes after acceptance. Pre-migration ACCEPTED rows keep NULL
-- inviteeId and are still matched by email.
ALTER TABLE "thread_invitations" ADD COLUMN IF NOT EXISTS "inviteeId" TEXT;
CREATE INDEX IF NOT EXISTS "thread_invitations_inviteeId_status_idx" ON "thread_invitations" ("inviteeId", "status");
