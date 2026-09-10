import { logger } from '@/lib/infrastructure/logger';
import { consumeSpendCap, enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AppError, isQuotaError } from '@/lib/utils/errors';
import { AiCallPath } from '@/lib/services/ai-cost-classification';

export async function assertSpendCapAvailable(path?: AiCallPath): Promise<void> {
  const spendCapResult = path ? await enforceAiSpendCap(path) : await consumeSpendCap();
  if (!spendCapResult.allowed) {
    throw new AppError('AI spend cap exceeded — job skipped until UTC midnight reset', 'SERVICE_UNAVAILABLE', 503);
  }
}

export function assertThreadJob(jobData: { threadId?: string; messages?: unknown }) {
  const hasThreadId = jobData.threadId !== undefined && jobData.threadId !== null && jobData.threadId.length > 0;
  const hasMessages = jobData.messages !== undefined && jobData.messages !== null;
  if (!hasThreadId || !hasMessages) {
    throw new Error('Missing required fields: threadId and messages');
  }
}

/**
 * Quota/rate-limit errors (429) are swallowed rather than rethrown so `/api/jobs`
 * answers 200 and QStash skips its 3x retry — the limit won't clear inside the
 * retry window and retrying only amplifies it. Other errors still propagate.
 */
export async function runAiGeneration<T>(
  operationLabel: string,
  threadId: string,
  generationTask: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; skipped: true }> {
  try {
    const generatedValue = await generationTask();
    return { ok: true, value: generatedValue };
  } catch (generationError) {
    if (isQuotaError(generationError)) {
      let errorMessage = String(generationError);
      if (generationError instanceof Error) errorMessage = generationError.message;
      logger.warn(`[worker:ai] ${operationLabel} skipped for thread ${threadId} (AI quota/rate-limit)`, {
        error: errorMessage,
      });
      return { ok: false, skipped: true };
    }
    throw generationError;
  }
}
