import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireReadOrThrow, visibilityFilter } from '@/lib/thread-access';
import { prisma } from '@/lib/infrastructure/prisma';

export const GET = withErrorHandling(async (_request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const params = await context?.params;
  const threadId = params?.threadId;
  if (!threadId) return NextResponse.json(fail('BAD_REQUEST', 'threadId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const zid = z.string().cuid().safeParse(threadId);
  if (!zid.success) return NextResponse.json(fail('BAD_REQUEST', 'Invalid threadId'), { status: HTTP_STATUS.BAD_REQUEST });

  await requireReadOrThrow(threadId, session.user.id, session.user.role as never);
  const filter = await visibilityFilter(session.user.id, session.user.role as never);

  const visited = new Set<string>();
  const nodeMap = new Map<string, { id: string; name: string; slug: string; forkKind: string | null; supersedeStatus: string }>();
  const links: Array<{ id: string; source: string; target: string; similarity: number }> = [];

  async function load(id: string, depth: number): Promise<void> {
    if (visited.has(id) || depth > 4 || visited.size >= 60) return;
    visited.add(id);
    const t = await prisma.thread.findFirst({
      where: { id, deletedAt: null, ...filter },
      select: { id: true, name: true, slug: true, forkKind: true, supersedeStatus: true, forkedFromId: true },
    });
    if (!t) return;
    nodeMap.set(t.id, { id: t.id, name: t.name, slug: t.slug, forkKind: t.forkKind ?? null, supersedeStatus: t.supersedeStatus });
    if (t.forkedFromId) {
      await load(t.forkedFromId, depth + 1);
      if (nodeMap.has(t.forkedFromId)) links.push({ id: `${t.forkedFromId}->${t.id}`, source: t.forkedFromId, target: t.id, similarity: 1 });
    }
    const children = await prisma.thread.findMany({
      where: { forkedFromId: t.id, deletedAt: null, ...filter },
      select: { id: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    for (const c of children) {
      await load(c.id, depth + 1);
      if (nodeMap.has(c.id)) links.push({ id: `${t.id}->${c.id}`, source: t.id, target: c.id, similarity: 1 });
    }
  }

  await load(threadId, 0);
  const uniqLinks = Array.from(new Map(links.map((l) => [l.id, l])).values());
  return NextResponse.json(ok({ nodes: Array.from(nodeMap.values()), links: uniqLinks }));
});
