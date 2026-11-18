import { GoogleGenAI } from '@google/genai';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';
import { withRetry } from '@/lib/utils/retry';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_MODEL_ID } from './embedding-config';

export { EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION, EMBEDDING_MODEL_ID, EMBEDDING_DIMENSIONS, THREAD_EMBEDDING_CAP, KNOWLEDGE_EMBEDDING_CAP, TOTAL_EMBEDDING_CAP, EMBEDDING_BACKFILL_BATCH_SIZE, EMBEDDING_BACKFILL_MAX_PER_RUN } from './embedding-config';

export type EmbeddingResult = { embedding: number[]; model: string } | null;

function getEmbeddingApiKey(): string | null {
  const env = getEnv();
  // Prefer dedicated search/embedding key fallback chain, then provider key.
  return env.SASTRAM_GEMINI_KEY ?? env.GEMINI_API_KEY ?? null;
}

let _client: GoogleGenAI | null = null;
let _clientKey: string | null = null;

function getClient(): GoogleGenAI | null {
  const key = getEmbeddingApiKey();
  if (!key) return null;
  if (_client && _clientKey === key) return _client;
  _client = new GoogleGenAI({ apiKey: key });
  _clientKey = key;
  return _client;
}

export function isEmbeddingConfigured(): boolean {
  return getEmbeddingApiKey() !== null;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 8000);
}

export async function embedText(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
  const client = getClient();
  if (!client) return null;
  const content = normalizeText(text);
  if (!content) return null;

  try {
    const result = await withRetry(
      (retrySignal) =>
        client.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: content,
          config: {
            outputDimensionality: EMBEDDING_DIMENSIONS,
            // @google/genai passes abort via request options in some builds; include when supported.
            ...(retrySignal ? { abortSignal: retrySignal } : {}),
          },
        } as Parameters<typeof client.models.embedContent>[0]),
      2,
      300,
      15_000,
      signal,
    );

    const values = (result as { embeddings?: Array<{ values?: number[] }> }).embeddings?.[0]?.values
      ?? (result as { embedding?: { values?: number[] } }).embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      logger.warn('[embeddings] unexpected embedding shape', { length: values?.length });
      return null;
    }
    return { embedding: values, model: EMBEDDING_MODEL_ID };
  } catch (error) {
    logger.error('[embeddings] embedText failed', { error });
    return null;
  }
}

export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<Array<EmbeddingResult>> {
  // Batch sequentially to keep free-tier usage predictable and avoid burst limits.
  const out: Array<EmbeddingResult> = [];
  for (const text of texts) {
    out.push(await embedText(text, signal));
  }
  return out;
}

export function toVectorLiteral(values: number[]): string {
  // pgvector literal: '[1,2,3]'
  return `[${values.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`;
}

export function threadEmbeddingSource(name: string, aiSummary: string | null | undefined, description?: string | null): string {
  const parts = [name, aiSummary ?? '', description ?? ''].filter((p) => p && p.trim().length > 0);
  return parts.join('\n').trim();
}

export function knowledgePageEmbeddingSource(threadName: string, synthesizedContent: string): string {
  return [threadName, synthesizedContent].filter(Boolean).join('\n').trim();
}
