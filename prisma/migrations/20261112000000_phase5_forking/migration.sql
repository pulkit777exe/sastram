-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ForkKind" AS ENUM ('ASSUMPTION', 'CONTINUE', 'REMIX_AI', 'EXTERNAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CarryOverMode" AS ENUM ('SUMMARY', 'SELECTED_MESSAGES', 'NONE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SupersedeStatus" AS ENUM ('NONE', 'PROPOSED', 'ACCEPTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "forkKind" "ForkKind";
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "forkPremise" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "carryOverMode" "CarryOverMode";
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "carryOverSnapshot" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "externalSourceUrl" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "externalExcerpt" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "externalAttribution" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "supersedeStatus" "SupersedeStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "supersedeReason" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "supersedeProposedBy" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "supersedeProposedAt" TIMESTAMP(3);
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "supersedeDecidedBy" TEXT;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "supersedeDecidedAt" TIMESTAMP(3);

-- Backfill: legacy forked rows default to CONTINUE
UPDATE "threads"
SET "forkKind" = 'CONTINUE'
WHERE "forkedFromId" IS NOT NULL AND "forkKind" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "threads_forkedFromId_forkKind_idx" ON "threads"("forkedFromId", "forkKind");
CREATE INDEX IF NOT EXISTS "threads_supersedeStatus_idx" ON "threads"("supersedeStatus");
