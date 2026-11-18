# Phase 3 — Retrieval foundation (free-tier friendly)

## What shipped
- **pgvector enabled** on Neon via forward-only migration `20261111000000_phase3_retrieval_foundation` (`CREATE EXTENSION IF NOT EXISTS vector`).
- **Nullable embedding columns** added to `threads` and `knowledge_pages`:
  - `embedding vector(768)` — embedding over **thread title + summary** (`name` + `aiSummary`, with description fallback) and **knowledge page title + synthesized content**.
  - `embeddingModel` (text) — records model name and version as `text-embedding-004:1` (fixed dimension **768**).
- **Incremental backfill** via QStash job `generate-embeddings-backfill` in small batches (`EMBEDDING_BACKFILL_BATCH_SIZE=10`, capped per run) and under the daily AI spend cap. `update-threads` cron enqueues bounded backfill jobs when the embedding spend-cap gate allows.
- **ThreadRelation derived from real embeddings (kNN)** using pgvector cosine distance (`1 - (embedding <=> query)`), replacing DNA/Jaccard similarity. Relations are recomputed for embedded threads (`updateAllThreadRelations` / cron) and only stored when similarity ≥ 0.7 (top-k per source).
- **Local search = hybrid** for threads: pg_trgm lexical/trigram similarity + vector similarity, merged with **Reciprocal Rank Fusion** (`k=60`). Messages/users keep token/ILIKE ranking with added Redis caching; thread search preserves visibility/privacy filters (public/creator/invited/moderator) in the hybrid SQL path.
- **Redis cache** for local search results keyed by normalized query hash (plus type/scope/pagination context) with short TTL; falls back gracefully when Redis/embeddings are unavailable.
- **Vector caps** enforced during backfill to control storage and free-tier usage.

## Storage math (vector cap)

Assumptions (pgvector `vector(768)`):
- Float4 storage: `4 bytes * 768 dims = 3072 bytes` (~3 KB) per embedding value.
- Row overhead / `embeddingModel` text / index overhead: budget ~1–2 KB per embedded row.
- **Conservative estimate: ~5 KB per stored vector** (value + metadata + HNSW index share amortized).

Configured caps (see `lib/ai/embedding-config.ts`):
- `THREAD_EMBEDDING_CAP = 2000`
- `KNOWLEDGE_EMBEDDING_CAP = 500`
- **`TOTAL_EMBEDDING_CAP = 2500` vectors**

Estimated upper bound:
- `2500 vectors * ~5 KB ≈ 12.5 MB` total for embeddings + indexes.
- This fits comfortably within Neon's free-tier storage budget when combined with existing data; caps can be lowered further if needed.

Redis (Upstash) search cache:
- Keyed by normalized-query hash + scope + params, TTL 5 minutes, values are page-sized JSON result slices (tens of KB worst case per active query key) with natural expiry; no persistent vector storage in Redis.

## Free-tier / quota notes
- Embeddings use Gemini `text-embedding-004` (768-dim) via existing Gemini API key configuration; no new paid services.
- Backfill runs in small QStash batches and is gated by the existing daily AI spend cap (`AiCallPath.EMBEDDING`, tiny estimated cost). If spend cap/quotas are exhausted, jobs skip safely.
- HNSW indexes are created idempotently; on capped datasets planners may choose sequential scan, which is acceptable.

## Operational notes
- Migration is forward-only and idempotent (`IF NOT EXISTS` / additive columns). Do not edit applied migrations.
- If embeddings are unavailable (no key/config), hybrid thread search degrades to lexical/trigram ranking and relation recompute becomes a no-op until embeddings exist.
- Backfill prioritizes recently updated threads/pages missing embeddings and stops at caps.
