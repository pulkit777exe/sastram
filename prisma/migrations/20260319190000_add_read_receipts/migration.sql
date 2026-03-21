-- Create read_receipts table for per-thread read tracking
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'read_receipts') THEN
        CREATE TABLE "read_receipts" (
          "id" TEXT NOT NULL,
          "threadId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "lastReadMessageId" TEXT,
          "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id")
        );

        CREATE UNIQUE INDEX "read_receipts_threadId_userId_key"
          ON "read_receipts"("threadId", "userId");

        CREATE INDEX "read_receipts_threadId_idx" ON "read_receipts"("threadId");
        CREATE INDEX "read_receipts_userId_idx" ON "read_receipts"("userId");
        CREATE INDEX "read_receipts_readAt_idx" ON "read_receipts"("readAt");

        ALTER TABLE "read_receipts"
          ADD CONSTRAINT "read_receipts_threadId_fkey"
          FOREIGN KEY ("threadId") REFERENCES "sections"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;

        ALTER TABLE "read_receipts"
          ADD CONSTRAINT "read_receipts_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;

        ALTER TABLE "read_receipts"
          ADD CONSTRAINT "read_receipts_lastReadMessageId_fkey"
          FOREIGN KEY ("lastReadMessageId") REFERENCES "messages"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
    ELSE
        RAISE NOTICE 'Table read_receipts already exists';
    END IF;
END $$;
