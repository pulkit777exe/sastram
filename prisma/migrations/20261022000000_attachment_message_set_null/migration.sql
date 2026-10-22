-- Keep attachment blobs discoverable after a thread's hard purge.
-- Cascade-deleting the row orphaned the object in Blob storage forever.
ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "attachments_messageId_fkey";
ALTER TABLE "attachments" ALTER COLUMN "messageId" DROP NOT NULL;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
