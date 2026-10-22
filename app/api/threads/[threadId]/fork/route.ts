import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireReadOrThrow, visibilityFilter } from '@/lib/thread-access';
import { forkThreadDomain, threadVisibilitySchema } from '@/modules/threads/threads-write/service';
import { infraThreadSideEffects } from '@/modules/threads/adapters/infra-side-effects';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { rateLimit } from '@/lib/services/rate-limit';

const bodySchema = z.object({ title: z.string().min(3).max(120).optional(), visibility: threadVisibilitySchema.optional() });

export const GET = withErrorHandling(async (_request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const params = await context?.params;
  const threadId = params?.threadId;
  if (!threadId) return NextResponse.json(fail('BAD_REQUEST', 'threadId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const zid = z.string().cuid().safeParse(threadId);
  if (!zid.success) return NextResponse.json(fail('BAD_REQUEST', 'Invalid threadId'), { status: HTTP_STATUS.BAD_REQUEST });
  await requireReadOrThrow(threadId, session.user.id, session.user.role as never);
  const filter = await visibilityFilter(session.user.id, session.user.role as never);
  const forksWhere: import('@prisma/client').Prisma.ThreadWhereInput = {
    forkedFromId: threadId,
    deletedAt: null,
    ...filter,
  };
  const forks = await prisma.thread.findMany({
    where: forksWhere,
    select: { id: true, name: true, slug: true, description: true, createdAt: true, createdBy: true, visibility: true, messageCount: true, resolutionScore: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const relation = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { forkedFromId: true },
  });
  // The parent may have been private/restricted all along, or made private
  // after the fork. Never expose its name/description to a viewer who cannot
  // read it just because the fork is visible.
  const forkedFrom = relation?.forkedFromId
    ? await prisma.thread.findFirst({
        where: { id: relation.forkedFromId, deletedAt: null, ...filter },
        select: { id: true, name: true, slug: true, description: true },
      })
    : null;
  return NextResponse.json(ok({ forks, forkedFrom }));
});

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `fork:${session.user.id}`, type: 'api' });
  if (!success) return NextResponse.json(fail('RATE_LIMITED', 'Too many fork attempts'), { status: HTTP_STATUS.RATE_LIMITED });
  const params = await context?.params;
  const threadId = params?.threadId;
  if (!threadId) return NextResponse.json(fail('BAD_REQUEST', 'threadId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const zid = z.string().cuid().safeParse(threadId);
  if (!zid.success) return NextResponse.json(fail('BAD_REQUEST', 'Invalid threadId'), { status: HTTP_STATUS.BAD_REQUEST });

  let title: string | undefined;
  let visibility: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED' | undefined;
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) {
      title = parsed.data.title;
      visibility = parsed.data.visibility;
    }
  } catch {
    // no body is fine
  }

  // Access resolution returns the thread context; AppError status/code (404 /
  // 403) propagates unchanged through withErrorHandling.
  const sourceCtx = await requireReadOrThrow(threadId, session.user.id, session.user.role);

  const safeTitle = title?.trim()
    ? sanitizeUserContent(title.trim()).sanitized.trim().slice(0, 120) || title.trim().slice(0, 120)
    : undefined;

  const forked = await forkThreadDomain({
    sourceThreadId: sourceCtx.threadId,
    title: safeTitle,
    visibility,
    userId: session.user.id,
    sideEffects: infraThreadSideEffects,
  });
  return NextResponse.json(ok({ id: forked.id, slug: forked.slug }), { status: HTTP_STATUS.OK });
});
