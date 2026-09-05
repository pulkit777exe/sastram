-- Add welcomeEmailSent column to users if not exists (was added to schema but no migration generated)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "welcomeEmailSent" BOOLEAN NOT NULL DEFAULT false;
