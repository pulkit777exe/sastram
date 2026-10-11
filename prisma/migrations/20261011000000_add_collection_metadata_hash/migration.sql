-- Dedupe metadata-carrying rows (keep oldest) so the new
-- (collectionId, metadataHash) unique constraint can be created.
-- Matches the backfill script's keep-oldest invariant.
DELETE FROM "collection_items" a
USING "collection_items" b
WHERE a."id" > b."id"
  AND a."collectionId" = b."collectionId"
  AND a."threadId" IS NOT DISTINCT FROM b."threadId"
  AND a."sessionId" IS NOT DISTINCT FROM b."sessionId"
  AND a."messageId" IS NOT DISTINCT FROM b."messageId"
  AND a."metadata" IS NOT DISTINCT FROM b."metadata";

-- AlterTable
ALTER TABLE "collection_items" ADD COLUMN IF NOT EXISTS "metadataHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "collection_items_collectionId_metadataHash_key" ON "collection_items"("collectionId", "metadataHash");
