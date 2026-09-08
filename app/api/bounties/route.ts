import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { canAccessThread } from '@/lib/thread-access';
import { createBounty, totalBounty, listBounties } from '@/modules/bounties/repository';
import { rateLimit } from '@/lib/services/rate-limit';

const postSchema = z.object({ threadId: z.string().cuid(), amount: z.number().int().min(1).max(1000).default(10) });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `bounties:${session.user.id}`, type: 'api' });
  if (!success) return NextResponse.json(fail('RATE_LIMITED', 'Too many bounty attempts, try later'), { status: HTTP_STATUS.RATE_LIMITED });
  const body = postSchema.parse(await request.json());
  const thread = await prisma.thread.findUnique({ where: { id: body.threadId, deletedAt: null }, select: { id: true, createdBy: true, visibility: true } });
  if (!thread) return NextResponse.json(fail('THREAD_NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });
  const canAccess = await canAccessThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility as never }, session.user.id, session.user.role as never);
  if (!canAccess) return NextResponse.json(fail('FORBIDDEN', 'No access'), { status: HTTP_STATUS.FORBIDDEN });
  const bounty = await createBounty(body.threadId, session.user.id, body.amount);
  return NextResponse.json(ok(bounty), { status: HTTP_STATUS.OK });
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('threadId');
  if (!threadId) return NextResponse.json(fail('BAD_REQUEST', 'threadId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const zId = z.string().cuid().safeParse(threadId);
  if (!zId.success) return NextResponse.json(fail('BAD_REQUEST', 'Invalid threadId'), { status: HTTP_STATUS.BAD_REQUEST });
  const bounties = await listBounties(threadId);
  const total = await totalBounty(threadId);
  return NextResponse.json(ok({ bounties, total }));
});
