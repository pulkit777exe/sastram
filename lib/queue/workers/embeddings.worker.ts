import { logger } from '@/lib/infrastructure/logger';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { runGuardedWorker, readAlreadyBilled } from './_shared';
import { runEmbeddingBackfill } from '@/lib/services/embeddings';
import { EMBEDDING_BACKFILL_BATCH_SIZE } from '@/lib/ai/embedding-config';
import type { EmbeddingBackfillJobData } from '../types';

export async function handleEmbeddingsBackfillJob(data: EmbeddingBackfillJobData) {
  const target = data.target ?? 'all';
  const batchSize = Math.max(1, Math.min(data.batchSize ?? EMBEDDING_BACKFILL_BATCH_SIZE, 25));
  logger.info('[worker:ai] embeddings-backfill job', { target, batchSize });

  const result = await runGuardedWorker(
    'embeddings-backfill',
    AiCallPath.EMBEDDING,
    'embeddings-backfill',
    () => runEmbeddingBackfill(target, batchSize),
    { alreadyBilled: readAlreadyBilled(data) },
  );

  if (!result.ok) return { skipped: true };
  return result.value;
}
