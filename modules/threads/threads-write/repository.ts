import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { aiService } from '@/lib/services/ai';
import { buildThreadDTO } from '@/modules/threads/service';
import type { ThreadRecord, ThreadSummary } from '@/modules/threads/types';
import { Prisma } from '@prisma/client';

type ThreadStorageWithCommunityAndMessages = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: true;
    _count: { select: { messages: true; members: true } };
  };
}>;

const threadDNASchema = z.object({
  questionType: z.enum(['factual', 'opinion', 'technical', 'comparison', 'other']),
  expertiseLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  topics: z.array(z.string()).min(3).max(5),
  readTimeMinutes: z.number().int().min(1),
});

export async function createThread(payload: {
  name: string;
  description?: string | null;
  communityId?: string | null;
  slug: string;
  createdBy: string;
  initialMessage?: string;
}): Promise<ThreadSummary> {
  const thread = await prisma.section.create({
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

    try {
      const [threadDNA, resolutionScore] = await Promise.all([
        aiService.generateThreadDNA(initialMessages),
        aiService.calculateResolutionScore(initialMessages),
      ]);

      await prisma.section.update({
        where: { id: thread.id },
        data: { threadDna: threadDNA, resolutionScore },
      });
    } catch (error) {
      logger.error('Failed to generate thread metadata:', error);
      await prisma.section.update({
        where: { id: thread.id },
        data: {
          threadDna: {
            questionType: 'other',
            expertiseLevel: 'intermediate',
            topics: ['general discussion'],
            readTimeMinutes: 1,
          },
          resolutionScore: 50,
        },
      });
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
  await prisma.section.delete({
    where: { id: threadId },
  });
}

export async function updateThreadDNA(threadId: string, threadDNA: Record<string, unknown>): Promise<void> {
  const validatedDNA = threadDNASchema.parse(threadDNA);
  await prisma.section.update({
    where: { id: threadId },
    data: { threadDna: validatedDNA },
  });
}

export async function updateResolutionScore(threadId: string, score: number): Promise<void> {
  const validatedScore = z.number().int().min(0).max(100).parse(score);
  await prisma.section.update({
    where: { id: threadId },
    data: { resolutionScore: validatedScore },
  });
}

export async function updateThreadStaleness(threadId: string, isOutdated: boolean): Promise<void> {
  await prisma.section.update({
    where: { id: threadId },
    data: { isOutdated, lastVerifiedAt: new Date() },
  });
}
