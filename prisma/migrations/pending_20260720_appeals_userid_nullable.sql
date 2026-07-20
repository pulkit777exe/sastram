-- Pending migration: make appeals.userId nullable (fix SetNull relation warning)
--
-- Pre-existing schema wart: Appeal.userId was `String` (required) while the
-- AppealSubmitter relation used `onDelete: SetNull`. A NOT NULL column cannot
-- accept SET NULL, so Prisma warned:
--   "The onDelete referential action ... should not be set to SetNull when a
--    referenced field is required."
-- All other SetNull relations (Thread.createdBy, Message.senderId,
-- Appeal.moderatorId, Report.reporterId, UserBan.userId/bannedBy,
-- ReadReceipt.lastReadMessageId) already had nullable FK fields — only
-- Appeal.userId was required. Made it nullable so an appeal is preserved (user
-- reference nulled) when its submitter user is deleted.
--
-- NOT auto-applied. The committed migration history is drifted from the live
-- Neon DB (see docs/BACKLOG.md Slice 10); `prisma migrate dev` would demand a
-- destructive reset. Apply manually after reconciling history.

ALTER TABLE "appeals" ALTER COLUMN "userId" DROP NOT NULL;
