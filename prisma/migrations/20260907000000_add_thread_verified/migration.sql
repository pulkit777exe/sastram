-- Add verifiedAt/verifiedBy for human-verified resolution (KISS Tier 1.1)
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_verifiedBy_fkey') THEN
    ALTER TABLE "threads" ADD CONSTRAINT "threads_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "threads_verifiedAt_idx" ON "threads"("verifiedAt");
