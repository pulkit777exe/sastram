-- Phase 3: retrieval foundation (pgvector embeddings + hybrid search support)
-- Forward-only and idempotent where possible.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Thread: embedding over title + summary (aiSummary) with model/version metadata.
ALTER TABLE "threads"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768),
  ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;

-- KnowledgePage: embedding over title (via thread) + synthesized content.
ALTER TABLE "knowledge_pages"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768),
  ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;

-- Approximate nearest-neighbor indexes for cosine similarity (pgvector).
-- HNSW is safe to create idempotently on Neon/Postgres with pgvector; on small capped datasets
-- planners may still choose sequential scan, which is acceptable for free-tier caps.
CREATE INDEX IF NOT EXISTS "threads_embedding_hnsw_idx"
  ON "threads" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "knowledge_pages_embedding_hnsw_idx"
  ON "knowledge_pages" USING hnsw ("embedding" vector_cosine_ops);

-- Helpful partial/btree support for backfill selection (threads missing embeddings but having content).
CREATE INDEX IF NOT EXISTS "threads_embeddingModel_idx" ON "threads" ("embeddingModel");
CREATE INDEX IF NOT EXISTS "knowledge_pages_embeddingModel_idx" ON "knowledge_pages" ("embeddingModel");
