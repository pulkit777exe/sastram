import { prisma } from '@/lib/infrastructure/prisma';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '@/lib/queue/config';
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { z } from 'zod';

const paramsSchema = z.object({ threadId: z.string().cuid() });
const bodySchema = z.object({
  counterSourceUrl: z.string().url(),
  note: z.string().max(500).optional(),
});

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { threadId } = paramsSchema.parse(await context!.params);
  await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role as never);

  const body = bodySchema.parse(await request.json());

  const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { name: true, resolutionScore: true, isOutdated: true } });
  if (!thread) return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });

  const messages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    select: { id: true, content: true, senderId: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const subscribers = await prisma.threadSubscription.findMany({
    where: { threadId, isActive: true, userId: { not: null } },
    select: { userId: true },
  });

  // Inject challenge source as synthetic message for conflict detection
  const challengeMessages = [
    ...messages.map((m) => ({ id: m.id, content: m.content, senderId: m.senderId })),
    { id: 'challenge', content: `Counter-source: ${body.counterSourceUrl}\nNote: ${body.note ?? ''}`, senderId: session.user.id },
  ];

  await enqueueJob(AIJobType.DETECT_CONFLICTS, {
    threadId,
    messages: challengeMessages as never,
    subscriberIds: subscribers.map((s) => s.userId!),
    threadName: thread.name,
    cronJob: false,
  });

  await enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, {
    threadId,
    messages: challengeMessages as never,
    subscriberIds: subscribers.map((s) => s.userId!),
    threadName: thread.name,
    oldScore: thread.resolutionScore,
    isOutdated: thread.isOutdated,
    cronJob: false,
  });

  return NextResponse.json(ok({ queued: true, jobs: 2 }));
});
