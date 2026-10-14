-- pg_trgm search indexes (idempotent — safe to re-run).
--
-- Why a separate file: these GIN opclass indexes serve the ILIKE '%term%'
-- search in modules/search/repository.ts (Thread name/description/aiSummary,
-- Message content, User name/bio), but Prisma cannot express GIN opclasses
-- in schema.prisma. Keeping them in a migration makes every `migrate dev`
-- see phantom drift; here they are versioned plain SQL instead.
--
-- Apply once per database (Neon supports pg_trgm):
--   psql "$DATABASE_URL_UNPOOLED" -f prisma/extensions/pg-trgm.sql
-- Verify:
--   SELECT indexname FROM pg_indexes WHERE indexname LIKE '%trgm%';
--   EXPLAIN SELECT id FROM threads WHERE name ILIKE '%test%';
-- (expect a Bitmap Index Scan on threads_name_trgm_idx)

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX IF NOT EXISTS "threads_name_trgm_idx" ON "threads" USING gin ("name" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "threads_description_trgm_idx" ON "threads" USING gin ("description" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "threads_aiSummary_trgm_idx" ON "threads" USING gin ("aiSummary" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "messages_content_trgm_idx" ON "messages" USING gin ("content" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" "gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "users_bio_trgm_idx" ON "users" USING gin ("bio" "gin_trgm_ops");
