-- CreateTable
CREATE TABLE IF NOT EXISTS "bounties" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 10,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bounties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "bounties_threadId_idx" ON "bounties"("threadId");
CREATE INDEX IF NOT EXISTS "bounties_userId_idx" ON "bounties"("userId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bounties_threadId_fkey') THEN
    ALTER TABLE "bounties" ADD CONSTRAINT "bounties_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bounties_userId_fkey') THEN
    ALTER TABLE "bounties" ADD CONSTRAINT "bounties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
