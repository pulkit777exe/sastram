ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "forkedFromId" TEXT;
CREATE INDEX IF NOT EXISTS "threads_forkedFromId_idx" ON "threads"("forkedFromId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_forkedFromId_fkey') THEN
    ALTER TABLE "threads" ADD CONSTRAINT "threads_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
