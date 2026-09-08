-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FactCheckStatus') THEN
    CREATE TYPE "FactCheckStatus" AS ENUM ('UNCHECKED', 'VERIFIED', 'DISPUTED');
  END IF;
END $$;

-- AlterTable: convert existing TEXT values (lowercase) to enum upper case, handle unknown as UNCHECKED
ALTER TABLE "messages" ALTER COLUMN "factCheckStatus" DROP DEFAULT;
-- Use CASE to handle any unexpected values
ALTER TABLE "messages" ALTER COLUMN "factCheckStatus" TYPE "FactCheckStatus" USING (
  CASE UPPER("factCheckStatus")
    WHEN 'VERIFIED' THEN 'VERIFIED'::"FactCheckStatus"
    WHEN 'DISPUTED' THEN 'DISPUTED'::"FactCheckStatus"
    ELSE 'UNCHECKED'::"FactCheckStatus"
  END
);
ALTER TABLE "messages" ALTER COLUMN "factCheckStatus" SET DEFAULT 'UNCHECKED';
