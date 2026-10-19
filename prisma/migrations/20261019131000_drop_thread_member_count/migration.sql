-- Drop the dead Thread."memberCount" column.
--
-- It was written once at thread creation (always 0) and never maintained:
-- there is no membership table (access derives from visibility, creator and
-- invitations), and every reader was display-only ("0 members"). IF EXISTS
-- keeps the statement safe to replay from the SQL-editor payload, which
-- carries the same DDL for HTTPS-only environments.
ALTER TABLE "threads" DROP COLUMN IF EXISTS "memberCount";
