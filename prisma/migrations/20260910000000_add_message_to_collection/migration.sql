-- AlterTable
ALTER TABLE "collection_items" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
ALTER TABLE "collection_items" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "collection_items_messageId_idx" ON "collection_items"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "collection_items_collectionId_messageId_key" ON "collection_items"("collectionId", "messageId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_messageId_fkey') THEN
    ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
