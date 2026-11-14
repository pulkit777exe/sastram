import crypto from 'crypto';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { visibilityFilter } from '@/lib/thread-access';
import { Prisma, ProfilePrivacy, Role } from '@prisma/client';
import { getUpstashRedis, withRedisTimeout } from '@/lib/infrastructure/redis-upstash';
import { embedText, isEmbeddingConfigured, toVectorLiteral } from '@/lib/ai/embeddings';

const insensitive = 'insensitive' as const;
const IS_NOT_DELETED_THREAD: Prisma.ThreadWhereInput = { deletedAt: null };
const SEARCH_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const RRF_K = 60;

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function hashNormalizedQuery(query: string): string {
  return crypto.createHash('sha256').update(normalizeQuery(query)).digest('hex');
}

function tokenize(query: string): string[] {
  if (!query || typeof query !== 'string') return [];
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9_-]/g, ''))
    .filter((t) => t.length >= 2)
    .slice(0, 5);
}

function levenshtein(a: string, b: string): number {
  if (!a || !b) return Math.max((a ?? '').length, (b ?? '').length);
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]!;
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i] = Math.min(dp[i]! + 1, dp[i - 1]! + 1, prev + cost);
      prev = cur;
    }
  }
  return dp[a.length]!;
}

function tokenScore(token: string | null | undefined, text: string | null | undefined): number {
  if (!token || !text) return 0;
  const lower = text.toLowerCase();
  if (lower.includes(token)) {
    if (lower.split(/\W+/).includes(token)) return 1;
    return 0.7;
  }
  const words = lower.split(/\W+/).filter(Boolean);
  for (const w of words) {
    if (w.length < 3) continue;
    const dist = levenshtein(token, w);
    const maxLen = Math.max(token.length, w.length);
    if (dist === 1 && maxLen >= 4) return 0.4;
    if (dist === 2 && maxLen >= 6) return 0.2;
  }
  return 0;
}

function scoreMessage(message: { content: string; createdAt: Date; likeCount: number }, tokens: string[]): number {
  let score = 0;
  for (const tok of tokens) score += tokenScore(tok, message.content) * 10;
  const matched = tokens.filter((tok) => tokenScore(tok, message.content) > 0).length;
  score += matched * 3;
  if (tokens.length > 1 && matched === tokens.length) score += 4;
  score += Math.log1p(message.likeCount) * 0.3;
  const ageDays = (Date.now() - new Date(message.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 1 - ageDays / 60);
  return score;
}

function scoreUser(user: { name: string | null; followerCount: number }, tokens: string[]): number {
  let score = 0;
  for (const tok of tokens) score += tokenScore(tok, user.name) * 10;
  const matched = tokens.filter((tok) => tokenScore(tok, user.name) > 0).length;
  score += matched * 3;
  if (tokens.length > 1 && matched === tokens.length) score += 4;
  score += Math.log1p(user.followerCount) * 0.4;
  return score;
}

function rrfFuse(rankedLists: Array<string[]>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, idx) => {
      const rank = idx + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    });
  }
  return scores;
}

function reviveThreadDates<T extends { createdAt?: Date | string; updatedAt?: Date | string }>(threads: T[]): T[] {
  return threads.map((t) => ({
    ...t,
    createdAt: t.createdAt ? new Date(t.createdAt) : t.createdAt,
    updatedAt: t.updatedAt ? new Date(t.updatedAt) : t.updatedAt,
  }));
}

function viewerScopeKey(viewerUserId?: string, viewerRole?: Role | null): string {
  if (!viewerUserId) return 'anon';
  // Moderator/admin see all; cache separately. Regular users have per-user visibility (invites/creator).
  if (viewerRole === 'ADMIN' || viewerRole === 'MODERATOR') return `mod:${viewerRole}`;
  return `user:${viewerUserId}`;
}

async function getSearchCache<T>(key: string): Promise<T | null> {
  const redis = getUpstashRedis();
  if (!redis) return null;
  try {
    const raw = await withRedisTimeout(redis.get<string>(key), 1500);
    if (!raw || typeof raw !== 'string') return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setSearchCache(key: string, value: unknown): Promise<void> {
  const redis = getUpstashRedis();
  if (!redis) return;
  try {
    await withRedisTimeout(redis.set(key, JSON.stringify(value), { ex: SEARCH_CACHE_TTL_SECONDS }), 1500);
  } catch {
    // best-effort cache
  }
}

async function getViewerEmail(userId?: string): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return u?.email ?? null;
}

function buildThreadVisibilitySql(viewerUserId?: string, viewerRole?: Role | null, viewerEmail?: string | null): Prisma.Sql {
  if (viewerRole === 'ADMIN' || viewerRole === 'MODERATOR') {
    return Prisma.sql`TRUE`;
  }
  if (!viewerUserId) {
    return Prisma.sql`t."visibility" = 'PUBLIC'`;
  }
  const email = (viewerEmail ?? '').toLowerCase();
  return Prisma.sql`(
    t."visibility" = 'PUBLIC'
    OR t."createdBy" = ${viewerUserId}
    OR EXISTS (
      SELECT 1 FROM "thread_invitations" ti
      WHERE ti."threadId" = t."id"
        AND ti."status" = 'ACCEPTED'
        AND (ti."inviteeId" = ${viewerUserId} OR (${email} <> '' AND lower(ti."email") = ${email}))
    )
  )`;
}

type ThreadRow = {
  id: string; name: string; slug: string; description: string | null; visibility: string;
  resolutionScore: number | null; isOutdated: boolean; aiSummary: string | null; messageCount: number;
  createdAt: Date; updatedAt: Date; createdBy: string | null;
  creator: { id: string; name: string | null; image: string | null } | null;
};

async function searchThreadsHybrid(
  query: string,
  limit: number,
  offset: number,
  viewerUserId?: string,
  viewerRole?: Role | null
): Promise<{ threads: ThreadRow[]; total: number; hasMore: boolean }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { threads: [], total: 0, hasMore: false };
  const norm = normalizeQuery(trimmed);
  const cacheKey = `srch:threads:v2:${hashNormalizedQuery(norm)}:${viewerScopeKey(viewerUserId, viewerRole)}:${limit}:${offset}`;
  const cached = await getSearchCache<{ threads: ThreadRow[]; total: number; hasMore: boolean }>(cacheKey);
  if (cached) return { ...cached, threads: reviveThreadDates(cached.threads) as ThreadRow[] };

  const tokens = tokenize(trimmed);
  const effectiveTokens = tokens.length ? tokens : [norm];
  const likePattern = `%${effectiveTokens[0]}%`;
  const viewerEmail = await getViewerEmail(viewerUserId);
  const vis = buildThreadVisibilitySql(viewerUserId, viewerRole, viewerEmail);
  const windowSize = Math.max(offset + limit + 1, 50);

  // Lexical candidates via pg_trgm similarity/ILIKE (hybrid "full-text/trigram" leg)
  let lexical: Array<{ id: string }> = [];
  try {
    lexical = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t."id"
      FROM "threads" t
      WHERE t."deletedAt" IS NULL
        AND ${vis}
        AND (
          t."name" ILIKE ${likePattern}
          OR t."description" ILIKE ${likePattern}
          OR t."aiSummary" ILIKE ${likePattern}
          OR similarity(COALESCE(t."name", ''), ${trimmed}) > 0.1
          OR similarity(COALESCE(t."description", ''), ${trimmed}) > 0.1
          OR similarity(COALESCE(t."aiSummary", ''), ${trimmed}) > 0.1
        )
      ORDER BY GREATEST(
        similarity(COALESCE(t."name", ''), ${trimmed}),
        similarity(COALESCE(t."description", ''), ${trimmed}) * 0.8,
        similarity(COALESCE(t."aiSummary", ''), ${trimmed}) * 0.6
      ) DESC, t."updatedAt" DESC
      LIMIT ${windowSize}
    `;
  } catch {
    lexical = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t."id"
      FROM "threads" t
      WHERE t."deletedAt" IS NULL
        AND ${vis}
        AND (
          t."name" ILIKE ${likePattern}
          OR t."description" ILIKE ${likePattern}
          OR t."aiSummary" ILIKE ${likePattern}
        )
      ORDER BY t."updatedAt" DESC
      LIMIT ${windowSize}
    `;
  }

  let vectorIds: string[] = [];
  if (isEmbeddingConfigured()) {
    try {
      const emb = await embedText(trimmed);
      if (emb) {
        const vec = toVectorLiteral(emb.embedding);
        const vector = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT t."id"
          FROM "threads" t
          WHERE t."deletedAt" IS NULL
            AND t."embedding" IS NOT NULL
            AND ${vis}
          ORDER BY t."embedding" <=> ${vec}::vector ASC
          LIMIT ${windowSize}
        `;
        vectorIds = vector.map((r) => r.id);
      }
    } catch (e) {
      logger.warn('[searchThreads] vector leg failed, falling back to lexical', { error: e });
    }
  }

  const lexicalIds = lexical.map((r) => r.id);
  const fused = rrfFuse([lexicalIds, vectorIds]);
  const rankedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  let pageIds = rankedIds.slice(offset, offset + limit);
  // Fallback: if hybrid produced nothing (e.g. no trgm match edge cases), use previous token behavior window
  if (pageIds.length === 0 && lexicalIds.length === 0 && vectorIds.length === 0) {
    // preserve old behavior loosely by ILIKE token OR
    const ors: Prisma.ThreadWhereInput[] = [];
    for (const term of effectiveTokens) {
      ors.push({ name: { contains: term, mode: insensitive } });
      ors.push({ description: { contains: term, mode: insensitive } });
      ors.push({ aiSummary: { contains: term, mode: insensitive } });
    }
    const where: Prisma.ThreadWhereInput = { ...IS_NOT_DELETED_THREAD, AND: [{ OR: ors }, await visibilityFilter(viewerUserId, viewerRole)] };
    const candidates = await prisma.thread.findMany({ where, select: { id: true }, orderBy: { updatedAt: 'desc' }, take: windowSize });
    const ids = candidates.map((c) => c.id);
    const fused2 = rrfFuse([ids]);
    pageIds = [...fused2.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(offset, offset + limit);
  }

  const hasMore = rankedIds.length > offset + limit || lexical.length === windowSize || vectorIds.length === windowSize;

  if (pageIds.length === 0) {
    const empty = { threads: [] as ThreadRow[], total: rankedIds.length, hasMore: false };
    await setSearchCache(cacheKey, empty);
    return empty;
  }

  const rows = await prisma.thread.findMany({
    where: { id: { in: pageIds }, deletedAt: null },
    include: { creator: { select: { id: true, name: true, image: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r as unknown as ThreadRow]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((r): r is ThreadRow => Boolean(r));
  const result = { threads: ordered, total: rankedIds.length, hasMore };
  await setSearchCache(cacheKey, result);
  return result;
}

export async function searchThreads(
  query: string,
  limit: number = 20,
  offset: number = 0,
  threadIds?: string[],
  viewerUserId?: string,
  viewerRole?: Role | null
) {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { threads: [], total: 0, hasMore: false };
    if (threadIds && threadIds.length > 0) {
      // Scoped search keeps previous behavior (no global hybrid index assumptions for arbitrary id sets).
      const tokens = tokenize(trimmed);
      const terms = tokens.length ? tokens : [trimmed];
      const or: Prisma.ThreadWhereInput[] = [];
      for (const term of terms) {
        or.push({ name: { contains: term, mode: insensitive } });
        or.push({ description: { contains: term, mode: insensitive } });
        or.push({ aiSummary: { contains: term, mode: insensitive } });
      }
      const where: Prisma.ThreadWhereInput = { ...IS_NOT_DELETED_THREAD, id: { in: threadIds }, AND: [{ OR: or }, await visibilityFilter(viewerUserId, viewerRole)] };
      const candidates = await prisma.thread.findMany({ where, include: { creator: { select: { id: true, name: true, image: true } } }, orderBy: { createdAt: 'desc' }, take: offset + limit + 1 });
      // lightweight score for ordering
      const eff = tokens.length ? tokens : [trimmed.toLowerCase()];
      const scored = candidates.map((t) => ({ t, s: eff.reduce((acc, tok) => acc + tokenScore(tok, t.name) * 10 + tokenScore(tok, t.description) * 3 + tokenScore(tok, t.aiSummary), 0) })).filter((x) => x.s > 0).sort((a,b)=>b.s-a.s);
      return { threads: scored.slice(offset, offset + limit).map((x) => x.t), total: scored.length, hasMore: scored.length > offset + limit };
    }
    return await searchThreadsHybrid(trimmed, limit, offset, viewerUserId, viewerRole);
  } catch (error) {
    logger.error('[searchThreads]', error);
    return { threads: [], total: 0, hasMore: false };
  }
}

const IS_NOT_DELETED_MESSAGE: Prisma.MessageWhereInput = { deletedAt: null };

async function buildMessageSearchWhere(
  query: string,
  threadId: string | undefined,
  viewerUserId: string | undefined,
  viewerRole: Role | null | undefined
): Promise<Prisma.MessageWhereInput> {
  const tokens = tokenize(query);
  const searchTerms = tokens.length ? tokens : [query];
  const or: Prisma.MessageWhereInput[] = searchTerms.map((term) => ({ content: { contains: term, mode: insensitive } }));
  const where: Prisma.MessageWhereInput = {
    ...IS_NOT_DELETED_MESSAGE,
    OR: or,
    thread: { deletedAt: null, AND: [await visibilityFilter(viewerUserId, viewerRole)] },
  };
  if (threadId) where.threadId = threadId;
  return where;
}

export async function searchMessages(
  query: string,
  threadId?: string,
  limit: number = 20,
  offset: number = 0,
  viewerUserId?: string,
  viewerRole?: Role | null
) {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { messages: [], total: 0, hasMore: false };
    const tokens = tokenize(trimmed);
    const norm = normalizeQuery(trimmed);
    const cacheKey = `srch:messages:v2:${hashNormalizedQuery(norm)}:${viewerScopeKey(viewerUserId, viewerRole)}:${threadId ?? 'all'}:${limit}:${offset}`;
    const cached = await getSearchCache<{ messages: Awaited<ReturnType<typeof prisma.message.findMany>>; total: number; hasMore: boolean }>(cacheKey);
    if (cached) return cached;

    const where = await buildMessageSearchWhere(trimmed, threadId, viewerUserId, viewerRole);
    const window = offset + limit + 1;
    const candidates = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, image: true } },
        thread: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: window,
    });
    const effectiveTokens = tokens.length ? tokens : [trimmed.toLowerCase()];
    const scored = candidates
      .map((m) => ({ message: m, score: scoreMessage(m, effectiveTokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const page = scored.slice(offset, offset + limit).map((x) => x.message);
    const hasMore = scored.length > offset + limit || candidates.length === window;
    const result = { messages: page, total: scored.length, hasMore };
    await setSearchCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.error('[searchMessages]', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

const IS_ACTIVE_NOT_DELETED_USER: Prisma.UserWhereInput = { status: 'ACTIVE', deletedAt: null };

export async function searchUsers(query: string, limit: number = 20, offset: number = 0, viewerId?: string) {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { users: [], total: 0, hasMore: false };
    const tokens = tokenize(trimmed);
    const norm = normalizeQuery(trimmed);
    const cacheKey = `srch:users:v2:${hashNormalizedQuery(norm)}:${viewerId ? `u:${viewerId}` : 'anon'}:${limit}:${offset}`;
    const cached = await getSearchCache<{ users: Array<{ id: string; name: string | null; image: string | null; bio?: string | null; followerCount: number; followingCount: number }>; total: number; hasMore: boolean }>(cacheKey);
    if (cached) return cached;

    const searchTerms = tokens.length ? tokens : [trimmed];
    const or: Prisma.UserWhereInput[] = [];
    for (const term of searchTerms) {
      or.push({ name: { contains: term, mode: insensitive } });
    }

    const privacyWhere: Prisma.UserWhereInput =
      viewerId && viewerId.length > 0
        ? {
            OR: [
              { id: viewerId },
              { profilePrivacy: ProfilePrivacy.PUBLIC },
              {
                profilePrivacy: ProfilePrivacy.FOLLOWERS_ONLY,
                following: { some: { followerId: viewerId } },
              },
            ],
          }
        : { profilePrivacy: ProfilePrivacy.PUBLIC };

    const where: Prisma.UserWhereInput = {
      ...IS_ACTIVE_NOT_DELETED_USER,
      AND: [{ OR: or }, privacyWhere],
    };

    const window = offset + limit + 1;
    const candidates = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        image: true,
        bio: true,
        followerCount: true,
        followingCount: true,
      },
      orderBy: [{ followerCount: 'desc' }],
      take: window,
    });
    const effectiveTokens = tokens.length ? tokens : [trimmed.toLowerCase()];
    const scored = candidates
      .map((u) => ({ user: u, score: scoreUser(u, effectiveTokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const page = scored.slice(offset, offset + limit).map(({ user }) => {
      if (viewerId !== undefined && viewerId !== null && user.id === viewerId) return user;
      const { bio: _bio, ...rest } = user;
      return rest;
    });
    const hasMore = scored.length > offset + limit || candidates.length === window;
    const result = { users: page, total: scored.length, hasMore };
    await setSearchCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.error('[searchUsers]', error);
    return { users: [], total: 0, hasMore: false };
  }
}
