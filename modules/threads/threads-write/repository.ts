import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadDTO } from '@/modules/threads/service';
import type { ThreadRecord, ThreadSummary } from '@/modules/threads/types';
import { z } from 'zod';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { threadDnaSchema } from '@/lib/schemas/thread-dna';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import type { JobMessageData } from '@/lib/queue/types';

type InitialMessage = Pick<JobMessageData, 'id' | 'content' | 'senderId' | 'sender' | 'createdAt'>;

export async function createThread(payload: {
  name: string;
  description?: string | null;
  slug: string;
  createdBy: string;
  initialMessage?: string;
}): Promise<ThreadSummary> {
  const thread = await prisma.thread.create({
    data: {
      name: payload.name,
      description: payload.description,
      slug: payload.slug,
      createdBy: payload.createdBy,
      messageCount: payload.initialMessage ? 1 : 0,
      messages: payload.initialMessage
        ? { create: { content: payload.initialMessage, senderId: payload.createdBy } }
        : undefined,
    },
    include: {
      messages: true,
      _count: { select: { messages: true } },
    },
  });

  if (payload.initialMessage) {
    await enqueueInitialAiJobs(thread.id, {
      id: thread.messages[0].id,
      content: payload.initialMessage,
      senderId: payload.createdBy,
      sender: { id: payload.createdBy, name: null, image: null },
      createdAt: thread.messages[0].createdAt,
    });
  }

  return buildThreadDTO(thread as ThreadRecord, thread._count.messages, 0);
}

// DNA and resolution score are the two expensive AI paths, so they're gated by the
// spend cap *before* enqueue — no point queueing work we can't pay for.
async function enqueueInitialAiJobs(threadId: string, message: InitialMessage): Promise<void> {
  const messages = [message];
  const gated = [
    { type: AIJobType.GENERATE_THREAD_DNA, path: AiCallPath.THREAD_DNA, label: 'DNA' },
    {
      type: AIJobType.CALCULATE_RESOLUTION_SCORE,
      path: AiCallPath.RESOLUTION_SCORE,
      label: 'resolution-score',
    },
  ];

  try {
    const jobs: Promise<void>[] = [];
    for (const { type, path, label } of gated) {
      if ((await enforceAiSpendCap(path)).allowed) {
        jobs.push(enqueueJob(type, { threadId, messages }));
      } else {
        logger.warn(`[createThread] ${label} enqueue blocked by spend cap for thread ${threadId}`);
      }
    }
    await Promise.allSettled(jobs);
  } catch (error) {
    // Non-critical — the thread exists; AI enrichment can be retried later.
    logger.error('Failed to enqueue thread AI jobs:', error);
  }
}

// Soft-delete only. The purge cron (app/api/cron/update-threads) hard-removes the
// row plus cascade once deletedAt is past the retention window.
export async function deleteThread(threadId: string): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { deletedAt: new Date() },
  });
}

export async function updateThreadDNA(
  threadId: string,
  threadDNA: Record<string, unknown>
): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: threadDnaSchema.parse(threadDNA) },
  });
}

export async function updateResolutionScore(threadId: string, score: number): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { resolutionScore: z.number().int().min(0).max(100).parse(score) },
  });
}

export async function updateThreadStaleness(threadId: string, isOutdated: boolean): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { isOutdated, lastVerifiedAt: new Date() },
  });
}
