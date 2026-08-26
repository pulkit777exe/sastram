import { logger } from '@/lib/infrastructure/logger';
import { consumeSpendCap } from '@/lib/services/ai-spend-cap';
import { isQuotaError } from '@/lib/utils/errors';
import type { JobMessageData } from '../types';

export async function assertSpendCapAvailable(): Promise<void> {
  const cap = await consumeSpendCap();
  if (!cap.allowed) {
    throw new Error('AI spend cap exceeded — job skipped until UTC midnight reset');
  }
}

export function assertThreadJob(data: { threadId?: string; messages?: unknown }) {
  if (!data.threadId || !data.messages) {
    throw new Error('Missing required fields: threadId and messages');
  }
}

/**
 * Quota/rate-limit errors (429) are swallowed rather than rethrown so `/api/jobs`
 * answers 200 and QStash skips its 3x retry — the limit won't clear inside the
 * retry window and retrying only amplifies it. Other errors still propagate.
 */
export async function runAiGeneration<T>(
  label: string,
  threadId: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; skipped: true }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    if (isQuotaError(error)) {
      logger.warn(`[worker:ai] ${label} skipped for thread ${threadId} (AI quota/rate-limit)`, {
        error: error instanceof Error ? error.message : error,
      });
      return { ok: false, skipped: true };
    }
    throw error;
  }
}
