import { prisma } from '@/lib/infrastructure/prisma';
import type { Prisma } from '@prisma/client';
import crypto from 'crypto';
import type {
  Source,
  SynthesisResult,
  Citation,
  PhaseTimings,
} from './types';

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(normalizeQuery(query)).digest('hex');
}

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

/**
 * Persist a completed search to the user-scoped AiSearchSession / AiSearchResult
 * models. Best-effort: failures are logged but never throw to the caller.
 *
 * Stores the FULL structured synthesis (text, citations, followUps, conflictData)
 * per harness §4 — history replay must render citation chips and follow-up chips
 * without re-running the search.
 */
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
    const logger = (await import('@/lib/infrastructure/logger')).logger;
    logger.error('[ai-search] Failed to persist search session', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
    return null;
  }
}

/**
 * List a user's search sessions (cursor-paginated, harness §10). Soft-deleted
 * sessions (deletedAt != null) are excluded — a user's "remove from history" is
 * a soft delete, not a hard delete.
 */
export async function listUserSearchSessions(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<{ sessions: PersistedSession[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const where = { userId, deletedAt: null } as const;

  const sessions = await prisma.aiSearchSession.findMany({
    where: opts.cursor
      ? { ...where, createdAt: { lt: new Date(opts.cursor) } }
      : where,
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
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].createdAt.toISOString() : null;

  return {
    sessions: page.map((s) => mapSession(s)),
    nextCursor,
  };
}

/**
 * Load a single session by ID, scoped to the requesting user (harness §8 IDOR
 * guard — must verify ownership, not just authentication).
 */
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

/**
 * List top-level sessions (no parent) with their follow-up children nested,
 * for Perplexity-style threaded sidebar rendering (harness §10a).
 */
export async function listThreadedSessions(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<{ sessions: Array<PersistedSession & { children: PersistedSession[] }>; nextCursor: string | null }> {
  const { sessions: parents, nextCursor } = await listUserSearchSessions(userId, opts);
  const parentIds = parents.map((p) => p.id);

  let childrenByParent = new Map<string, PersistedSession[]>();
  if (parentIds.length > 0) {
    const children = await prisma.aiSearchSession.findMany({
      where: { userId, parentSessionId: { in: parentIds }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        results: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    childrenByParent = new Map(
      parentIds.map((id) => [id, children.filter((c) => c.parentSessionId === id).map(mapSession)])
    );
  }

  return {
    sessions: parents.map((p) => ({ ...p, children: childrenByParent.get(p.id) ?? [] })),
    nextCursor,
  };
}

/**
 * Soft-delete a session from a user's history (harness §10). Hard-delete only
 * happens on account deletion via the existing onDelete: Cascade.
 */
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
