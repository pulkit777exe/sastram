import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { visibilityFilter } from '@/lib/thread-access';
import { Prisma, Role } from '@prisma/client';

const insensitive = 'insensitive' as const;

const IS_NOT_DELETED_THREAD: Prisma.ThreadWhereInput = { deletedAt: null };

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

function scoreThread(
  thread: { name: string; description: string | null; aiSummary: string | null; messageCount: number; createdAt: Date },
  tokens: string[]
): number {
  let score = 0;
  for (const tok of tokens) {
    const nameS = tokenScore(tok, thread.name);
    const descS = tokenScore(tok, thread.description);
    const sumS = tokenScore(tok, thread.aiSummary);
    score += nameS * 10 + descS * 3 + sumS * 1;
  }
  const matchedTokens = tokens.filter((tok) => tokenScore(tok, thread.name) > 0 || tokenScore(tok, thread.description) > 0 || tokenScore(tok, thread.aiSummary) > 0).length;
  score += matchedTokens * 2;
  if (tokens.length > 1 && matchedTokens === tokens.length) score += 5;
  score += Math.log1p(thread.messageCount) * 0.5;
  const ageDays = (Date.now() - new Date(thread.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 2 - ageDays / 90);
  return score;
}

async function buildThreadSearchWhere(
  query: string,
  threadIds: string[] | undefined,
  viewerUserId: string | undefined,
  viewerRole: Role | null | undefined
): Promise<Prisma.ThreadWhereInput> {
  const tokens = tokenize(query);
  const searchTerms = tokens.length ? tokens : [query];
  const or: Prisma.ThreadWhereInput[] = [];
  for (const term of searchTerms) {
    or.push({ name: { contains: term, mode: insensitive } });
    or.push({ description: { contains: term, mode: insensitive } });
    or.push({ aiSummary: { contains: term, mode: insensitive } });
  }
  const where: Prisma.ThreadWhereInput = {
    ...IS_NOT_DELETED_THREAD,
    AND: [
      {
        OR: or,
      },
      await visibilityFilter(viewerUserId, viewerRole),
    ],
  };
  if (threadIds && threadIds.length > 0) where.id = { in: threadIds };
  return where;
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
    const tokens = tokenize(trimmed);
    const where = await buildThreadSearchWhere(trimmed, threadIds, viewerUserId, viewerRole);

    // Window, not pool: fetch only the page plus one probe row. The old
    // max(limit*5, 200) pulled up to 200 full rows + a join to render 20,
    // plus a parallel count that was discarded whenever any row scored > 0.
    const window = offset + limit + 1;
    const candidates = await prisma.thread.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: window,
    });

    const scored = candidates
      .map((t) => ({ thread: t, score: scoreThread(t, tokens.length ? tokens : [trimmed.toLowerCase()]) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const page = scored.slice(offset, offset + limit).map((x) => x.thread);
    // Exact when the window wasn't exhausted; "maybe more" at the edge
    // (previously exact via a second full-count scan on every request).
    const hasMore = scored.length > offset + limit || candidates.length === window;

    return { threads: page, total: scored.length, hasMore };
  } catch (error) {
    logger.error('[searchThreads]', error);
    return { threads: [], total: 0, hasMore: false };
  }
}

const IS_NOT_DELETED_MESSAGE: Prisma.MessageWhereInput = { deletedAt: null };

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
    const where = await buildMessageSearchWhere(trimmed, threadId, viewerUserId, viewerRole);
    // Window, not pool (see searchThreads): page + one probe row, no
    // discarded parallel count.
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
    return { messages: page, total: scored.length, hasMore };
  } catch (error) {
    logger.error('[searchMessages]', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

const IS_ACTIVE_NOT_DELETED_USER: Prisma.UserWhereInput = { status: 'ACTIVE', deletedAt: null };

function scoreUser(user: { name: string | null; bio: string | null; followerCount: number }, tokens: string[]): number {
  let score = 0;
  for (const tok of tokens) {
    score += tokenScore(tok, user.name) * 10 + tokenScore(tok, user.bio) * 2;
  }
  const matched = tokens.filter((tok) => tokenScore(tok, user.name) > 0 || tokenScore(tok, user.bio) > 0).length;
  score += matched * 3;
  if (tokens.length > 1 && matched === tokens.length) score += 4;
  score += Math.log1p(user.followerCount) * 0.4;
  return score;
}

export async function searchUsers(query: string, limit: number = 20, offset: number = 0) {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { users: [], total: 0, hasMore: false };
    const tokens = tokenize(trimmed);
    const searchTerms = tokens.length ? tokens : [trimmed];
    const or: Prisma.UserWhereInput[] = [];
    for (const term of searchTerms) {
      or.push({ name: { contains: term, mode: insensitive } });
      or.push({ bio: { contains: term, mode: insensitive } });
    }
    const where: Prisma.UserWhereInput = {
      ...IS_ACTIVE_NOT_DELETED_USER,
      OR: or,
    };

    // Window, not pool (see searchThreads): page + one probe row, no
    // discarded parallel count.
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
    const page = scored.slice(offset, offset + limit).map((x) => x.user);
    const hasMore = scored.length > offset + limit || candidates.length === window;
    return { users: page, total: scored.length, hasMore };
  } catch (error) {
    logger.error('[searchUsers]', error);
    return { users: [], total: 0, hasMore: false };
  }
}
