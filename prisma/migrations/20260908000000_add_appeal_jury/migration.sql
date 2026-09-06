-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppealVoteDecision') THEN
    CREATE TYPE "AppealVoteDecision" AS ENUM ('APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "appeal_votes" (
    "id" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "vote" "AppealVoteDecision",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeal_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "appeal_votes_appealId_moderatorId_key" ON "appeal_votes"("appealId", "moderatorId");
CREATE INDEX IF NOT EXISTS "appeal_votes_appealId_idx" ON "appeal_votes"("appealId");
CREATE INDEX IF NOT EXISTS "appeal_votes_moderatorId_idx" ON "appeal_votes"("moderatorId");
CREATE INDEX IF NOT EXISTS "appeal_votes_appealId_vote_idx" ON "appeal_votes"("appealId", "vote");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appeal_votes_appealId_fkey') THEN
    ALTER TABLE "appeal_votes" ADD CONSTRAINT "appeal_votes_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "appeals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appeal_votes_moderatorId_fkey') THEN
    ALTER TABLE "appeal_votes" ADD CONSTRAINT "appeal_votes_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
