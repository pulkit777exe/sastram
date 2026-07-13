-- Phase 1 / Phase 3 / Phase 4 hardening baseline.
--
-- This migration captures EVERY schema change that landed in production Neon during
-- the 2026-07-12 hardening pass:
--
--   Phase 1  - Soft-delete on Thread + Community
--   Phase 3  - CHECK constraints on ModerationRule.{category,action,severity} and UserActivity.type
--   Phase 4  - Listing indexes (ThreadMember, Notification, Thread)
--
-- History context:
--   - On 2026-07-12 the soft-delete column adds and the 3 listing indexes were first
--     pushed to production via `prisma db push`, which intentionally does NOT
--     write a migration-history record (it is for prototyping, not production).
--   - This baseline migration is the OFFICIAL record of what landed. It uses
--     idempotent SQL so it can be replayed safely against:
--         (a) the existing production DB (which already has the columns + indexes
--             from the `db:push` step) - everything below is a no-op EXCEPT the
--             5 final statements, which still need to run.
--         (b) a fresh empty DB replaying prior migrations through
--             20260711030000_remove_reaction_notification_type - here, every
--             statement below adds what the prior migrations did not.

--------------------------------------------------------------------------------
STEP 1 of 4 - Phase 1: add deletedAt to Thread and Community.
Both columns are added with IF NOT EXISTS so this is a no-op on production
(which already has them) and a forward-additive change on a fresh DB.
--------------------------------------------------------------------------------

ALTER TABLE "threads"     ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

--------------------------------------------------------------------------------
STEP 2 of 4 - Phase 4: 3 new listing indexes.
The Phase 4 indexes are not expressible in Prisma's schema language in the form
Prisma's migrate generator emits them; this file uses the exact form Prisma
emits (no DESC clause). `IF NOT EXISTS` makes both scenarios safe.
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "thread_members_userId_status_idx"
  ON "thread_members"("userId", "status");

CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx"
  ON "notifications"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "threads_visibility_communityId_updatedAt_idx"
  ON "threads"("visibility", "communityId", "updatedAt");

--------------------------------------------------------------------------------
STEP 3 of 4 - Phase 3: 4 CHECK constraints.
These are not expressible in Prisma's schema language, so they live only as
hand-written SQL. Both the production DB and a fresh-from-prior-migrations DB
will need to apply them on replay.
--------------------------------------------------------------------------------

-- UserActivity.type
ALTER TABLE "user_activities"
  ADD CONSTRAINT "user_activities_type_check"
  CHECK ("type" IN ('MESSAGE_POSTED', 'THREAD_JOINED', 'AI_SEARCH'));

-- ModerationRule.action   (matches lib/services/moderation.ts typed unions)
ALTER TABLE "moderation_rules"
  ADD CONSTRAINT "moderation_rules_action_check"
  CHECK ("action" IN ('ALLOW', 'BLOCK', 'REVIEW', 'FLAG'));

-- ModerationRule.severity (matches lib/services/moderation.ts typed unions)
ALTER TABLE "moderation_rules"
  ADD CONSTRAINT "moderation_rules_severity_check"
  CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- ModerationRule.category (mirrors ReportCategory enum so rules + reports
--                          share semantics on the value side)
ALTER TABLE "moderation_rules"
  ADD CONSTRAINT "moderation_rules_category_check"
  CHECK ("category" IN ('SPAM', 'HARASSMENT', 'MISINFORMATION', 'ADULT_CONTENT', 'OTHER'));

--------------------------------------------------------------------------------
STEP 4 of 4 - Phase 1: 2 partial indexes on the new deletedAt columns.
These partially-indexed read helpers cover "find soft-deleted rows for the purge
cron" without bloating the main indexes with NULL pointers. NOT schema-prisma
expressible. `IF NOT EXISTS` so both deployment scenarios are safe.
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "threads_deletedAt_idx"
  ON "threads"("deletedAt")
  WHERE "deletedAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "communities_deletedAt_idx"
  ON "communities"("deletedAt")
  WHERE "deletedAt" IS NOT NULL;
