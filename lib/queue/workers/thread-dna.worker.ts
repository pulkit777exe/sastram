import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { assertSpendCapAvailable, assertThreadJob, runAiGeneration } from './_shared';
import type { ThreadDnaJobData, JobMessageData } from '../types';

async function generateThreadDNA(threadId: string, messages: JobMessageData[]) {
  logger.info(`Generating thread DNA for thread: ${threadId}`);
  await assertSpendCapAvailable();
  const result = await runAiGeneration('thread-dna', threadId, () =>
    aiService.generateThreadDNA(messages),
  );
  if (!result.ok) return { threadDNA: null, skipped: true };
  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: result.value },
  });
  return { threadDNA: result.value };
}

export async function handleThreadDnaJob(data: ThreadDnaJobData) {
  logger.info('[worker:ai] thread-dna job');
  assertThreadJob(data);
  return generateThreadDNA(data.threadId, data.messages);
}
