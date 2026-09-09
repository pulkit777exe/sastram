-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");
