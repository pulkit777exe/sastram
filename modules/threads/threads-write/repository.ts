import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadDTO } from '@/modules/threads/service';
import type { ThreadRecord, ThreadSummary } from '@/modules/threads/types';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
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
  // Option A: set memberCount: 1 directly in the nested create rather than wrapping
  // in a transaction and issuing a separate increment-update. This is structurally
  // different from join/leave (modules/members/actions.ts:78-81,108-111) which uses
  // tx.thread.update({ memberCount: { increment/decrement: 1 } }) — and that's
  // correct. Join/leave is a state transition on an existing thread where the prior
  // count is unknown; creation is declaring the initial state of a brand-new row.
  // Setting it to 1 directly expresses the invariant ("a new thread starts with
  // exactly 1 member: the OWNER"), avoids an extra round-trip on the project's
  // highest-frequency write path, and keeps single-query atomicity.
  //
  // NOTE on _count.members vs. Thread.memberCount: both answer "how many members"
  // but are maintained independently. _count is a live COUNT(*) from ThreadMember
  // rows; memberCount is denormalized for read perf. This dual-answer is exactly
  // what caused the memberCount drift surfaced by the reconciliation cron — and is
  // the reason we validate it periodically instead of trusting the denorm blindly.
  const thread = await prisma.thread.create({
    data: {
      name: payload.name,
      description: payload.description,
      communityId: payload.communityId,
      slug: payload.slug,
      createdBy: payload.createdBy,
      messageCount: payload.initialMessage ? 1 : 0,
      memberCount: 1,
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
        enqueueJob(AIJobType.GENERATE_THREAD_DNA, { threadId: thread.id, messages: initialMessages }),
        enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, { threadId: thread.id, messages: initialMessages }),
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
  // Soft-delete: set deletedAt instead of hard-deleting. The purge cron
  // (app/api/cron/update-threads/route.ts) hard-removes the row + cascade
  // once deletedAt is older than the retention window.
  await prisma.thread.update({
    where: { id: threadId },
    data: { deletedAt: new Date() },
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
