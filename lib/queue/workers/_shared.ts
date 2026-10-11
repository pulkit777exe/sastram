import { logger } from '@/lib/infrastructure/logger';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { isQuotaError } from '@/lib/utils/errors';
import { AiCallPath, evaluateAiCostGate } from '@/lib/services/ai-cost-classification';
import { isSpendCapError } from '@/lib/ai/guard';

export interface GuardedWorkerOptions {
  /**
   * Request-scoped idempotency key. When set, the route already consumed
   * spend — the worker skips consumption (fixes double-billing).
   */
  alreadyBilled?: string;
}

/** Defensive read — job payloads predate the alreadyBilled field. */
export function readAlreadyBilled(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>).alreadyBilled;
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

/**
 * Single seam for AI worker execution: spend + gate pre-check, then run the
 * task with quota/spend errors swallowed to skip (no QStash retry
 * amplification — the limit won't clear inside the retry window).
 */
export async function runGuardedWorker<T>(
  operationLabel: string,
  path: AiCallPath,
  threadId: string,
  task: () => Promise<T>,
  options?: GuardedWorkerOptions
): Promise<{ ok: true; value: T } | { ok: false; skipped: true }> {
  const alreadyBilled = options?.alreadyBilled;
  const billed = typeof alreadyBilled === 'string' && alreadyBilled.length > 0;
  if (!billed) {
    const spendCapResult = await enforceAiSpendCap(path);
    const gateResult = evaluateAiCostGate({ path, spendCapAllowed: spendCapResult.allowed });
    if (!spendCapResult.allowed || !gateResult.allowed) {
      logger.warn(`[worker:ai] ${operationLabel} skipped for thread ${threadId} (spend cap)`);
      return { ok: false, skipped: true };
    }
  }

  try {
    const value = await task();
    return { ok: true, value };
  } catch (generationError) {
    if (isQuotaError(generationError) || isSpendCapError(generationError)) {
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

export function assertThreadJob(jobData: { threadId?: string; messages?: unknown }) {
  const hasThreadId = jobData.threadId !== undefined && jobData.threadId !== null && jobData.threadId.length > 0;
  const hasMessages = jobData.messages !== undefined && jobData.messages !== null;
  if (!hasThreadId || !hasMessages) {
    throw new Error('Missing required fields: threadId and messages');
  }
}
