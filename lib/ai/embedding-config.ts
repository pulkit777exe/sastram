export const EMBEDDING_MODEL = 'text-embedding-004';
export const EMBEDDING_MODEL_VERSION = '1';
export const EMBEDDING_MODEL_ID = `${EMBEDDING_MODEL}:${EMBEDDING_MODEL_VERSION}`;
export const EMBEDDING_DIMENSIONS = 768;

// Caps to stay within Neon/Upstash/Gemini free quotas.
// Total vectors = THREAD_EMBEDDING_CAP + KNOWLEDGE_EMBEDDING_CAP.
export const THREAD_EMBEDDING_CAP = 2000;
export const KNOWLEDGE_EMBEDDING_CAP = 500;
export const TOTAL_EMBEDDING_CAP = THREAD_EMBEDDING_CAP + KNOWLEDGE_EMBEDDING_CAP;

// Backfill batch sizing (kept small to respect daily AI/cron budgets).
export const EMBEDDING_BACKFILL_BATCH_SIZE = 10;
// Max embedding jobs/items processed per cron/update-threads run.
export const EMBEDDING_BACKFILL_MAX_PER_RUN = 30;
