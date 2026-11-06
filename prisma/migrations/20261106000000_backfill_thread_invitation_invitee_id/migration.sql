-- Backfill inviteeId for invitations accepted before the column existed.
-- Application lookups match email case-insensitively, so mirror that here.
-- Rows whose email no longer maps to a user keep the legacy email fallback.
UPDATE "thread_invitations" AS ti
SET "inviteeId" = u.id
FROM "users" AS u
WHERE ti.status = 'ACCEPTED'
  AND ti."inviteeId" IS NULL
  AND u.email IS NOT NULL
  AND lower(ti.email) = lower(u.email);
