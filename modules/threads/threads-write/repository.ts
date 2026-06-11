import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadDTO } from '@/modules/threads/service';
import type { ThreadRecord, ThreadSummary } from '@/modules/threads/types';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getThreadDnaQueue, getResolutionScoreQueue } from '@/lib/queue/queue';
import { AIJobType, DEFAULT_JOB_OPTIONS } from '@/lib/queue/config';
import { threadDnaSchema } from '@/lib/schemas/thread-dna';

type ThreadStorageWithCommunityAndMessages = Prisma.ThreadGetPayload<{
  include: {
    community: true;
    messages: true;
    _count: { select: { messages: true; members: true } };
  };
}>;

export async function createThread(payload: {
  name: string;
  description?: string | null;
  communityId?: string | null;
  slug: string;
  createdBy: string;
  initialMessage?: string;
}): Promise<ThreadSummary> {
  const thread = await prisma.thread.create({
    data: {
      name: payload.name,
      description: payload.description,
      communityId: payload.communityId,
      slug: payload.slug,
      createdBy: payload.createdBy,
      members: {
        create: {
          userId: payload.createdBy,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      },
      messages: payload.initialMessage
        ? {
            create: {
              content: payload.initialMessage,
              senderId: payload.createdBy,
              depth: 0,
              isAiResponse: false,
              isEdited: false,
              isPinned: false,
              likeCount: 0,
              replyCount: 0,
            },
          }
        : undefined,
    },
    include: {
      community: true,
      messages: true,
      _count: {
        select: {
          messages: true,
          members: true,
        },
      },
    },
  });

  if (payload.initialMessage) {
    const initialMessages = [
      {
        id: thread.messages[0].id,
        content: payload.initialMessage,
        senderId: payload.createdBy,
        sender: {
          id: payload.createdBy,
          name: null,
          image: null,
        },
        createdAt: thread.messages[0].createdAt,
      },
    ];

    // Enqueue background jobs for AI analysis instead of blocking the response
    try {
      await Promise.all([
        getThreadDnaQueue().add(
          AIJobType.GENERATE_THREAD_DNA,
          { threadId: thread.id, messages: initialMessages },
          DEFAULT_JOB_OPTIONS
        ),
        getResolutionScoreQueue().add(
          AIJobType.CALCULATE_RESOLUTION_SCORE,
          { threadId: thread.id, messages: initialMessages },
          DEFAULT_JOB_OPTIONS
        ),
      ]);
    } catch (error) {
      logger.error('Failed to enqueue thread AI jobs:', error);
      // Non-critical — thread is created, AI will be processed later
    }
  }

  const typedThread = thread as ThreadStorageWithCommunityAndMessages;
  return buildThreadDTO(
    typedThread as unknown as ThreadRecord,
    typedThread._count.messages,
    0,
    typedThread._count.members
  );
}

export async function deleteThread(threadId: string): Promise<void> {
  await prisma.thread.delete({
    where: { id: threadId },
  });
}

export async function updateThreadDNA(threadId: string, threadDNA: Record<string, unknown>): Promise<void> {
  const validatedDNA = threadDnaSchema.parse(threadDNA);
  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: validatedDNA },
  });
}

export async function updateResolutionScore(threadId: string, score: number): Promise<void> {
  const validatedScore = z.number().int().min(0).max(100).parse(score);
  await prisma.thread.update({
    where: { id: threadId },
    data: { resolutionScore: validatedScore },
  });
}

export async function updateThreadStaleness(threadId: string, isOutdated: boolean): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { isOutdated, lastVerifiedAt: new Date() },
  });
}
