import { prisma } from '@/lib/infrastructure/prisma';
import type { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { logger } from '@/lib/infrastructure/logger';
import type {
  Source,
  SynthesisResult,
  Citation,
  PhaseTimings,
} from './types';
import { hashQuery } from './hash';

export interface PersistedSession {
  id: string;
  query: string;
  queryType: string | null;
  title: string | null;
  synthesis: string;
  citations: Citation[];
  sourceCount: number;
  sources: Source[];
  followUps: string[];
  conflictData: SynthesisResult['conflictData'];
  parentSessionId: string | null;
  createdAt: Date;
}

export interface PersistOptions {
  id?: string;
  parentSessionId?: string;
  title?: string;
  timings?: PhaseTimings;
}

/** Best-effort persist — failures are logged, never thrown. */
export async function persistSearchSession(
  userId: string,
  query: string,
  synthesis: SynthesisResult,
  sources: Source[],
  followUps: string[],
  opts: PersistOptions = {}
): Promise<string | null> {
  try {
    const queryHash = hashQuery(query);
    const timings = opts.timings;
    const sessionId = opts.id ?? crypto.randomUUID();
    const session = await prisma.aiSearchSession.create({
      data: {
        id: sessionId,
        userId,
        query,
        queryHash,
        queryType: synthesis.queryType,
        title: opts.title ?? null,
        parentSessionId: opts.parentSessionId ?? null,
        cacheHit: Boolean(synthesis.cachedAt),
        processingMs: synthesis.processingTimeMs,
        classifyMs: timings?.classifyMs ?? null,
        searchMs: timings?.searchMs ?? null,
        crossrefMs: timings?.crossrefMs ?? null,
        synthesizeMs: timings?.synthesizeMs ?? null,
        provider: timings?.provider ?? null,
        tokenCostUsd: timings?.tokenCostUsd ?? null,
      },
    });

    await prisma.aiSearchResult.create({
      data: {
        sessionId: session.id,
        queryHash,
        synthesis: synthesis.text || synthesis.content,
        citations: (synthesis.citations ?? []) as unknown as Prisma.InputJsonValue,
        followUps: (followUps ?? []) as unknown as Prisma.InputJsonValue,
        confidence: Math.round(synthesis.confidence ?? 0),
        sourceCount: sources.length,
        conflictFound: synthesis.conflictData?.detected ?? false,
        conflictData: (synthesis.conflictData ?? null) as unknown as Prisma.InputJsonValue,
        sources: (sources ?? []) as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });

    return session.id;
  } catch (err: unknown) {
    logger.error('[ai-search] Failed to persist search session', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
    return null;
  }
}

/** Cursor-paginated list; soft-deleted sessions excluded. */
export async function listUserSearchSessions(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<{ sessions: PersistedSession[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const where = { userId, deletedAt: null } as const;

  // Build where clause explicitly — avoid spread ternary for readability.
  let whereClause: typeof where | (typeof where & { createdAt: { lt: Date } });
  if (opts.cursor) {
    whereClause = { ...where, createdAt: { lt: new Date(opts.cursor) } };
  } else {
    whereClause = where;
  }

  const sessions = await prisma.aiSearchSession.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      results: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const hasMore = sessions.length > limit;
  const page = sessions.slice(0, limit);

  // Explicit if/else instead of ternary with && for clarity.
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    nextCursor = page[page.length - 1].createdAt.toISOString();
  }

  return {
    sessions: page.map((s) => mapSession(s)),
    nextCursor,
  };
}

/** Load one session, scoped to owner. */
export async function getSearchSession(
  userId: string,
  sessionId: string
): Promise<PersistedSession | null> {
  const s = await prisma.aiSearchSession.findFirst({
    where: { id: sessionId, userId, deletedAt: null },
    include: {
      results: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!s) return null;
  return mapSession(s);
}

/** Top-level sessions with follow-up children nested. */
export async function listThreadedSessions(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<{ sessions: Array<PersistedSession & { children: PersistedSession[] }>; nextCursor: string | null }> {
  const { sessions: parents, nextCursor } = await listUserSearchSessions(userId, opts);
  const parentIds = parents.map((p) => p.id);

  const childrenByParent = new Map<string, PersistedSession[]>();
  if (parentIds.length > 0) {
    const children = await prisma.aiSearchSession.findMany({
      where: { userId, parentSessionId: { in: parentIds }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        results: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    // Explicit loops instead of nested filter->map inside Map constructor.
    // Initialize empty arrays for each parentId to guarantee every parent has an entry.
    for (const parentId of parentIds) {
      childrenByParent.set(parentId, []);
    }
    for (const child of children) {
      const parentId = child.parentSessionId;
      if (parentId === null) {
        continue;
      }
      const bucket = childrenByParent.get(parentId);
      if (bucket) {
        bucket.push(mapSession(child));
      }
    }
  }

  return {
    sessions: parents.map((p) => ({ ...p, children: childrenByParent.get(p.id) ?? [] })),
    nextCursor,
  };
}

/** Soft-delete from history; hard-delete only on account deletion. */
export async function softDeleteSearchSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const res = await prisma.aiSearchSession.updateMany({
    where: { id: sessionId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return res.count > 0;
}

function mapSession(s: {
  id: string;
  query: string;
  queryType: string | null;
  title: string | null;
  parentSessionId: string | null;
  createdAt: Date;
  results: Array<{
    synthesis: string;
    sourceCount: number;
    citations?: unknown;
    followUps?: unknown;
    conflictData?: unknown;
    sources?: unknown;
  }>;
}): PersistedSession {
  const result = s.results[0];
  const sources = (result?.sources as unknown as Source[]) ?? [];
  const conflictData =
    (result?.conflictData as unknown as SynthesisResult['conflictData']) ?? null;
  return {
    id: s.id,
    query: s.query,
    queryType: s.queryType,
    title: s.title,
    synthesis: result?.synthesis ?? '',
    citations: (result?.citations as unknown as Citation[]) ?? [],
    sourceCount: result?.sourceCount ?? 0,
    sources,
    followUps: (result?.followUps as unknown as string[]) ?? [],
    conflictData,
    parentSessionId: s.parentSessionId,
    createdAt: s.createdAt,
  };
}
