import { prisma } from '@/lib/infrastructure/prisma';
import type { ThreadRecord } from '@/modules/threads/types';
import { z } from 'zod';
import { threadDnaSchema } from '@/lib/schemas/thread-dna';

export interface CreateThreadResult {
  thread: ThreadRecord;
  messageCount: number;
  initialMessage?: { id: string; content: string; createdAt: Date };
}

export async function createThread(payload: {
  name: string;
  description?: string | null;
  slug: string;
  createdBy: string;
  initialMessage?: string;
}): Promise<CreateThreadResult> {
  const hasInitialMessage = Boolean(payload.initialMessage);
  const thread = await prisma.thread.create({
    data: {
      name: payload.name,
      description: payload.description,
      slug: payload.slug,
      createdBy: payload.createdBy,
      messageCount: hasInitialMessage ? 1 : 0,
      messages: hasInitialMessage
        ? { create: { content: payload.initialMessage!, senderId: payload.createdBy } }
        : undefined,
    },
    include: {
      messages: true,
      _count: { select: { messages: true } },
    },
  });

  const record = thread as ThreadRecord;

  let initialMessage: CreateThreadResult['initialMessage'] = undefined;
  if (payload.initialMessage && thread.messages[0]) {
    initialMessage = {
      id: thread.messages[0].id,
      content: payload.initialMessage,
      createdAt: thread.messages[0].createdAt,
    };
  }

  return {
    thread: record,
    messageCount: thread._count.messages,
    initialMessage,
  };
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

export async function updateThreadVerified(threadId: string, userId: string): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { verifiedAt: new Date(), verifiedBy: userId, isOutdated: false, lastVerifiedAt: new Date() },
  });
}
