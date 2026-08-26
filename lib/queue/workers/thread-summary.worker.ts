import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { assertSpendCapAvailable, assertThreadJob, runAiGeneration } from './_shared';
import type { ThreadSummaryJobData, JobMessageData } from '../types';

async function generateThreadSummary(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread summary for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('thread-summary', threadId, () =>
    aiService.generateThreadSummary(messages),
  );
  if (!result.ok) return { summary: null, skipped: true };
  const { sanitized: summary } = sanitizeUserContent(result.value);
  await prisma.thread.update({
    where: { id: threadId },
    data: { aiSummary: summary },
  });
  return { summary };
}

export async function handleThreadSummaryJob(data: ThreadSummaryJobData) {
  logger.info('[worker:ai] thread-summary job');
  assertThreadJob(data);
  return generateThreadSummary(data.threadId, data.messages);
}
