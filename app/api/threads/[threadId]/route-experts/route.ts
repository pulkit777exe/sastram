import { NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { dispatch } from '@/modules/notifications/dispatcher';
import { z } from 'zod';

const paramsSchema = z.object({ threadId: z.string().cuid() });

export const POST = withErrorHandling(async (_: Request, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { threadId } = paramsSchema.parse(await context!.params);
  await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role as never);

  const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { threadDna: true, name: true } });
  if (!thread?.threadDna) return NextResponse.json(fail('NOT_FOUND', 'No DNA'), { status: HTTP_STATUS.NOT_FOUND });

  const dna = parseThreadDna(thread.threadDna);
  if (!dna) return NextResponse.json(fail('NOT_FOUND', 'No DNA'), { status: HTTP_STATUS.NOT_FOUND });

  // Find top 3 users who have posted in threads with overlapping topics
  const topic = dna.topics[0];
  if (!topic) return NextResponse.json(fail('NOT_FOUND', 'No topic'), { status: HTTP_STATUS.NOT_FOUND });

  const experts = await prisma.userActivity.findMany({
    where: { type: 'MESSAGE_CREATED', entityType: 'THREAD' },
    select: { userId: true },
    take: 100,
  });

  // Simple KISS: count by userId, pick top 3 not already invited and not OP
  const counts = new Map<string, number>();
  for (const a of experts) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => id !== session.user.id)
    .slice(0, 3);

  if (sorted.length === 0) return NextResponse.json(ok({ invited: [] }));

  // Create invitations
  for (const userId of sorted) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) continue;
    await prisma.threadInvitation.create({
      data: { threadId, senderId: session.user.id, email: user.email, status: 'PENDING' },
    }).catch(() => {});
  }

  await dispatch({
    recipients: { userIds: sorted },
    category: 'INVITATION',
    title: `Invited to ${thread.name}`,
    message: `You were invited as an expert for ${topic}`,
    data: { threadId },
  });

  return NextResponse.json(ok({ invited: sorted }));
});
