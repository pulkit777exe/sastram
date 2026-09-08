import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { canManageThread } from '@/lib/thread-access';
import { resolveMarketPoll } from '@/modules/polls/repository';
import { rateLimit } from '@/lib/services/rate-limit';

const bodySchema = z.object({ resolvedOptionIndex: z.number().int().min(0) });

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `poll-resolve:${session.user.id}`, type: 'api' });
  if (!success) return NextResponse.json(fail('RATE_LIMITED', 'Too many resolve attempts'), { status: HTTP_STATUS.RATE_LIMITED });
  const params = await context?.params;
  const pollId = params?.pollId;
  if (!pollId) return NextResponse.json(fail('BAD_REQUEST', 'pollId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const zId = z.string().cuid().safeParse(pollId);
  if (!zId.success) return NextResponse.json(fail('BAD_REQUEST', 'Invalid pollId'), { status: HTTP_STATUS.BAD_REQUEST });
  const { resolvedOptionIndex } = bodySchema.parse(await request.json());

  const poll = await prisma.poll.findUnique({ where: { id: pollId }, select: { id: true, threadId: true, isMarket: true, isActive: true, options: true } });
  if (!poll) return NextResponse.json(fail('NOT_FOUND', 'Poll not found'), { status: HTTP_STATUS.NOT_FOUND });
  if (!poll.isMarket) return NextResponse.json(fail('BAD_REQUEST', 'Not a market poll'), { status: HTTP_STATUS.BAD_REQUEST });
  if (!poll.isActive) return NextResponse.json(fail('BAD_REQUEST', 'Poll already resolved'), { status: HTTP_STATUS.BAD_REQUEST });

  const options = Array.isArray(poll.options) ? poll.options : [];
  if (resolvedOptionIndex >= options.length) return NextResponse.json(fail('BAD_REQUEST', 'Invalid option index'), { status: HTTP_STATUS.BAD_REQUEST });

  const thread = await prisma.thread.findUnique({ where: { id: poll.threadId }, select: { id: true, createdBy: true, visibility: true } });
  if (!thread) return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });
  const canManage = await canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility as never }, session.user.id, session.user.role as never);
  if (!canManage) return NextResponse.json(fail('FORBIDDEN', 'Only OP or admin can resolve market'), { status: HTTP_STATUS.FORBIDDEN });

  const updated = await resolveMarketPoll(pollId, resolvedOptionIndex);
  return NextResponse.json(ok(updated));
});
