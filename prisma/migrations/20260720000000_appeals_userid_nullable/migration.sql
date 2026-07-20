-- Make Appeal.userId nullable so the AppealSubmitter relation's onDelete: SetNull
-- is valid (a NOT NULL column cannot accept SET NULL). Pre-existing schema wart
-- fixed in schema.prisma (Appeal.userId String -> String?). The live DB already
-- carries all other out-of-band `db push` changes; this is the only remaining
-- delta (confirmed via `prisma migrate diff --from-config-datasource`).

ALTER TABLE "appeals" ALTER COLUMN "userId" DROP NOT NULL;
