import { cache } from 'react';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { slugify } from '@/lib/utils/slug';
import { countActiveUsersByThread } from '@/modules/threads/list';
import { visibilityFilter } from '@/lib/thread-access';
import type { ClaimStatus, Role } from '@prisma/client';

const withThreadCount = { _count: { select: { threads: true } } };

export async function createTag(name: string, color: string = '#3b82f6') {
  const slug = slugify(name);

  // Tags are keyed by slug, so re-creating an existing tag just refreshes its label/colour.
  return prisma.threadTag.upsert({
    where: { slug },
    update: { name, color },
    create: { name, slug, color },
  });
}

export async function addTagToThread(threadId: string, tagId: string) {
  return prisma.threadTagRelation.upsert({
    where: { threadId_tagId: { threadId, tagId } },
    update: {},
    create: { threadId, tagId },
  });
}

export async function removeTagFromThread(threadId: string, tagId: string) {
  try {
    await prisma.threadTagRelation.delete({
      where: { threadId_tagId: { threadId, tagId } },
    });
    return { id: '' };
  } catch (err) {
    logger.error('[tags] removeTagFromThread failed', { threadId, tagId, error: err });
    return null;
  }
}

export async function getPopularTags(limit: number = 20, viewerId?: string, viewerRole?: Role | null) {
  try {
    const filter = await visibilityFilter(viewerId, viewerRole);

    // One grouped count over visible threads. The previous implementation
    // ranked by the raw relation count (which includes private threads) and
    // then re-counted each candidate, which was both approximate and N+1.
    const counts = await prisma.threadTagRelation.groupBy({
      by: ['tagId'],
      where: { thread: { deletedAt: null, ...filter } },
      _count: { tagId: true },
    });

    const top = counts
      .map((row) => ({ tagId: row.tagId, threadCount: row._count.tagId }))
      .filter((row) => row.threadCount > 0)
      .sort((a, b) => b.threadCount - a.threadCount)
      .slice(0, limit);

    if (top.length === 0) return [];

    const tags = await prisma.threadTag.findMany({
      where: { id: { in: top.map((row) => row.tagId) } },
      select: { id: true, name: true, slug: true, color: true, createdAt: true },
    });
    const byId = new Map(tags.map((tag) => [tag.id, tag]));

    return top.flatMap((row) => {
      const tag = byId.get(row.tagId);
      return tag ? [{ ...tag, threadCount: row.threadCount }] : [];
    });
  } catch (error) {
    logger.error('[getPopularTags]', error);
    return [];
  }
}

export async function updateTag(id: string, data: { name?: string; color?: string }) {
  return prisma.threadTag.update({
    where: { id },
    data: data.name ? { ...data, slug: slugify(data.name) } : data,
  });
}

export async function deleteTag(id: string) {
  await prisma.threadTagRelation.deleteMany({ where: { tagId: id } });
  return prisma.threadTag.delete({ where: { id } });
}

export async function listAllTags(params?: { page?: number; pageSize?: number; search?: string }) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 50;

  const where = params?.search
    ? { name: { contains: params.search, mode: 'insensitive' as const } }
    : {};

  const tagsPromise = prisma.threadTag.findMany({
    where,
    include: withThreadCount,
    orderBy: { threads: { _count: 'desc' } },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const totalPromise = prisma.threadTag.count({ where });
  const [tags, total] = await Promise.all([tagsPromise, totalPromise]);

  return {
    tags: tags.map((t) => ({ ...t, threadCount: t._count.threads })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getTagBySlug(slug: string, viewerId?: string, viewerRole?: Role | null) {
  try {
    const tag = await prisma.threadTag.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, color: true, createdAt: true },
    });
    if (!tag) return null;
    const filter = await visibilityFilter(viewerId, viewerRole);
    const threadCount = await prisma.thread.count({
      where: { tags: { some: { tagId: tag.id } }, deletedAt: null, ...filter },
    });
    return { ...tag, threadCount };
  } catch (error) {
    logger.error('[getTagBySlug]', error);
    return null;
  }
}

export async function getThreadsByTag(tagId: string, viewerId?: string, viewerRole?: Role | null) {
  try {
    const filter = await visibilityFilter(viewerId, viewerRole);
    const threads = await prisma.thread.findMany({
      where: { tags: { some: { tagId } }, deletedAt: null, ...filter },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        messageCount: true,
        tags: { select: { tag: { select: { name: true, slug: true, color: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    // Active users = distinct non-null senders in the last 7 days, matching
    // the thread feed. Shared helper keeps one definition of the window; it
    // also excludes soft-deleted messages (the old all-time groupBy counted
    // every message of every thread carrying the tag).
    const activeUsersByThread = await countActiveUsersByThread(threads.map((t) => t.id));

    return threads.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description ?? '',
      activeUsers: activeUsersByThread.get(t.id) ?? 0,
      messagesCount: t.messageCount,
      trending: t.messageCount > 10,
      tags: t.tags.map((rel) => rel.tag.name),
    }));
  } catch (error) {
    logger.error('[getThreadsByTag]', error);
    return [];
  }
}

export async function mergeTags(sourceId: string, targetId: string) {
  const relations = await prisma.threadTagRelation.findMany({
    where: { tagId: sourceId },
  });

  // Upsert rather than update: the thread may already carry the target tag.
  await Promise.all(
    relations.map((r) =>
      prisma.threadTagRelation.upsert({
        where: { threadId_tagId: { threadId: r.threadId, tagId: targetId } },
        update: {},
        create: { threadId: r.threadId, tagId: targetId },
      })
    )
  );

  await prisma.threadTagRelation.deleteMany({ where: { tagId: sourceId } });
  await prisma.threadTag.delete({ where: { id: sourceId } });

  return prisma.threadTag.findUnique({ where: { id: targetId } });
}

export type TopicCredibilityLevel = 'INSUFFICIENT_DATA' | 'EMERGING' | 'MIXED' | 'SUPPORTED';

export interface TagCredibilitySummary {
  level: TopicCredibilityLevel;
  label: string;
  description: string;
  threadCount: number;
  resolvedThreadCount: number;
  totalClaims: number;
  byStatus: Record<ClaimStatus, number>;
  confirmVotes: number;
  disputeVotes: number;
}

export function deriveTopicCredibility(input: {
  threadCount: number;
  resolvedThreadCount: number;
  byStatus: Record<ClaimStatus, number>;
}): Pick<TagCredibilitySummary, 'level' | 'label' | 'description'> {
  const totalClaims = input.byStatus.OPEN + input.byStatus.CONFIRMED + input.byStatus.DISPUTED + input.byStatus.CONTESTED;
  if (input.threadCount < 2 || totalClaims < 2) {
    return {
      level: 'INSUFFICIENT_DATA',
      label: 'Insufficient data',
      description: 'Not enough visible threads or claims yet to estimate topic credibility.',
    };
  }

  const contestedShare = (input.byStatus.DISPUTED + input.byStatus.CONTESTED) / totalClaims;
  const confirmedShare = input.byStatus.CONFIRMED / totalClaims;
  const resolvedShare = input.resolvedThreadCount / Math.max(1, input.threadCount);

  if (confirmedShare >= 0.45 && contestedShare <= 0.2 && (input.resolvedThreadCount >= 1 || resolvedShare >= 0.25)) {
    return {
      level: 'SUPPORTED',
      label: 'Supported',
      description: 'Visible threads and claims show relatively strong confirmation with limited dispute.',
    };
  }

  if (contestedShare >= 0.25 || (input.byStatus.DISPUTED + input.byStatus.CONTESTED >= 2 && confirmedShare < 0.5)) {
    return {
      level: 'MIXED',
      label: 'Mixed',
      description: 'Signals are mixed: confirmed and disputed or contested claims coexist for this topic.',
    };
  }

  return {
    level: 'EMERGING',
    label: 'Emerging',
    description: 'Some trust signals exist, but evidence is still developing for this topic.',
  };
}

const CREDIBILITY_TTL_MS = 60_000;
const credibilityCache = new Map<string, { value: TagCredibilitySummary; expiresAt: number }>();

export const getTagCredibilitySummary = cache(async (
  tagId: string,
  viewerId?: string,
  viewerRole?: Role | null
): Promise<TagCredibilitySummary> => {
  const cacheKey = `${tagId}:${viewerId ?? 'anon'}:${viewerRole ?? 'none'}`;
  const now = Date.now();
  const cached = credibilityCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const filter = await visibilityFilter(viewerId, viewerRole);
    const threads = await prisma.thread.findMany({
      where: { tags: { some: { tagId } }, deletedAt: null, ...filter },
      select: { id: true, verifiedAt: true, resolutionScore: true },
    });

    const threadIds = threads.map((t) => t.id);
    const threadCount = threads.length;
    const resolvedThreadCount = threads.filter((t) => t.verifiedAt !== null || (t.resolutionScore ?? 0) > 70).length;

    const emptyByStatus: Record<ClaimStatus, number> = {
      OPEN: 0,
      CONFIRMED: 0,
      DISPUTED: 0,
      CONTESTED: 0,
    };

    if (threadIds.length === 0) {
      return {
        ...deriveTopicCredibility({ threadCount, resolvedThreadCount, byStatus: emptyByStatus }),
        threadCount,
        resolvedThreadCount,
        totalClaims: 0,
        byStatus: emptyByStatus,
        confirmVotes: 0,
        disputeVotes: 0,
      };
    }

    const claimWhere = { message: { threadId: { in: threadIds }, deletedAt: null } };
    const [grouped, agg] = await Promise.all([
      prisma.claim.groupBy({
        by: ['status'],
        where: claimWhere,
        _count: { _all: true },
      }),
      prisma.claim.aggregate({
        where: claimWhere,
        _sum: { confirmCount: true, disputeCount: true },
      }),
    ]);

    const byStatus: Record<ClaimStatus, number> = { ...emptyByStatus };
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
    }
    const totalClaims = byStatus.OPEN + byStatus.CONFIRMED + byStatus.DISPUTED + byStatus.CONTESTED;

    const value = {
      ...deriveTopicCredibility({ threadCount, resolvedThreadCount, byStatus }),
      threadCount,
      resolvedThreadCount,
      totalClaims,
      byStatus,
      confirmVotes: agg._sum.confirmCount ?? 0,
      disputeVotes: agg._sum.disputeCount ?? 0,
    };
    credibilityCache.set(cacheKey, { value, expiresAt: now + CREDIBILITY_TTL_MS });
    return value;
  } catch (error) {
    logger.error('[getTagCredibilitySummary]', error);
    const byStatus: Record<ClaimStatus, number> = { OPEN: 0, CONFIRMED: 0, DISPUTED: 0, CONTESTED: 0 };
    const value = {
      ...deriveTopicCredibility({ threadCount: 0, resolvedThreadCount: 0, byStatus }),
      threadCount: 0,
      resolvedThreadCount: 0,
      totalClaims: 0,
      byStatus,
      confirmVotes: 0,
      disputeVotes: 0,
    };
    credibilityCache.set(cacheKey, { value, expiresAt: now + 10_000 });
    return value;
  }
});
