-- CreateTable
CREATE TABLE IF NOT EXISTS "collections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "collection_items" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "threadId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "collections_userId_idx" ON "collections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "collection_items_collectionId_threadId_key" ON "collection_items"("collectionId", "threadId");
CREATE UNIQUE INDEX IF NOT EXISTS "collection_items_collectionId_sessionId_key" ON "collection_items"("collectionId", "sessionId");
CREATE INDEX IF NOT EXISTS "collection_items_collectionId_idx" ON "collection_items"("collectionId");
CREATE INDEX IF NOT EXISTS "collection_items_threadId_idx" ON "collection_items"("threadId");
CREATE INDEX IF NOT EXISTS "collection_items_sessionId_idx" ON "collection_items"("sessionId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collections_userId_fkey') THEN
    ALTER TABLE "collections" ADD CONSTRAINT "collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_collectionId_fkey') THEN
    ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_threadId_fkey') THEN
    ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_sessionId_fkey') THEN
    ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_search_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
