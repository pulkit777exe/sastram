import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { logger } from '@/lib/infrastructure/logger';
import type { ThreadSideEffectsPort } from '../ports/side-effects';

export const infraThreadSideEffects: ThreadSideEffectsPort = {
  async enqueueInitialAiJobs({ threadId, message }) {
    const messages = [message];
    try {
      await Promise.allSettled([
        enqueueJob(AIJobType.GENERATE_THREAD_DNA, { threadId, messages }),
        enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, { threadId, messages }),
      ]);
    } catch (error) {
      // Non-critical — the thread exists; AI enrichment can be retried later.
      logger.error('Failed to enqueue thread AI jobs:', error);
    }
  },
};
