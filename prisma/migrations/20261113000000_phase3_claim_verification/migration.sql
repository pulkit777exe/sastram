-- Phase 3: persist AI-search evidence and add claim-level verification models

DO $$ BEGIN
  CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISPUTED', 'CONTESTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClaimVoteType" AS ENUM ('CONFIRM', 'DISPUTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ai_search_results"
  ADD COLUMN IF NOT EXISTS "evidence" JSONB;

CREATE TABLE IF NOT EXISTS "claims" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
  "sourceId" TEXT,
  "sourceLabel" TEXT,
  "sourceUrl" TEXT,
  "excerpt" TEXT,
  "confidence" INTEGER,
  "confirmCount" INTEGER NOT NULL DEFAULT 0,
  "disputeCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "claim_votes" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ClaimVoteType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claim_votes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "claims_messageId_position_idx" ON "claims"("messageId", "position");
CREATE INDEX IF NOT EXISTS "claims_messageId_idx" ON "claims"("messageId");

CREATE UNIQUE INDEX IF NOT EXISTS "claim_votes_claimId_userId_key" ON "claim_votes"("claimId", "userId");
CREATE INDEX IF NOT EXISTS "claim_votes_claimId_idx" ON "claim_votes"("claimId");
CREATE INDEX IF NOT EXISTS "claim_votes_userId_idx" ON "claim_votes"("userId");

DO $$ BEGIN
  ALTER TABLE "claims"
    ADD CONSTRAINT "claims_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "claim_votes"
    ADD CONSTRAINT "claim_votes_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "claim_votes"
    ADD CONSTRAINT "claim_votes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
