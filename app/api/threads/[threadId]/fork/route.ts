import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { canAccessThread } from '@/lib/thread-access';
import { buildThreadSlug } from '@/modules/threads/slug';
import { forkThread } from '@/modules/threads/threads-write/repository';
import { rateLimit } from '@/lib/services/rate-limit';

const bodySchema = z.object({ title: z.string().min(3).max(120).optional() });

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
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) title = parsed.data.title;
  } catch {
    // no body is fine
  }

  const source = await prisma.thread.findUnique({ where: { id: threadId, deletedAt: null }, select: { id: true, name: true, description: true, visibility: true, createdBy: true } });
  if (!source) return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });
  const canAccess = await canAccessThread({ threadId: source.id, createdBy: source.createdBy, visibility: source.visibility as never }, session.user.id, session.user.role as never);
  if (!canAccess) return NextResponse.json(fail('FORBIDDEN', 'No access to fork'), { status: HTTP_STATUS.FORBIDDEN });

  const newTitle = title?.trim() ? title.trim() : `${source.name} (fork)`;
  let slug = buildThreadSlug(newTitle);
  const existing = await prisma.thread.findUnique({ where: { slug }, select: { id: true } });
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const forked = await forkThread({ name: newTitle, description: source.description, slug, createdBy: session.user.id, forkedFromId: source.id });
  return NextResponse.json(ok({ id: forked.id, slug: forked.slug }), { status: HTTP_STATUS.OK });
});
