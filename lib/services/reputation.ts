import { prisma } from '@/lib/infrastructure/prisma';

/**
 * Reputation scoring — KISS Tier 3.
 *
 * No column, no table. Reputation is computed on the fly from verified threads
 * authored by the user. A thread is "verified" when `verifiedAt` is set (via
 * `markThreadVerified` — OP or admin). Soft-deleted threads are excluded.
 *
 * Score is deliberately linear so the helper stays predictable and leaderboard
 * ordering matches verified count.
 */

export const REPUTATION_POINTS_PER_VERIFIED_THREAD = 10;

export type ReputationResult = {
  userId: string;
  verifiedThreadCount: number;
  reputationScore: number;
};

export type LeaderboardEntry = {
  userId: string;
  name: string | null;
  image: string | null;
  verifiedThreadCount: number;
  reputationScore: number;
};

/**
 * Pure calculation — no DB access.
 * 1 verified thread = REPUTATION_POINTS_PER_VERIFIED_THREAD points.
 */
export function calculateReputationScore(verifiedThreadCount: number): number {
  const count = Math.floor(Number(verifiedThreadCount));
  if (!Number.isFinite(count) || count <= 0) return 0;
  return count * REPUTATION_POINTS_PER_VERIFIED_THREAD;
}

/**
 * Count verified threads authored by a single user.
 */
export async function countVerifiedThreadsByUser(userId: string): Promise<number> {
  if (!userId) return 0;
  return prisma.thread.count({
    where: {
      createdBy: userId,
      verifiedAt: { not: null },
      deletedAt: null,
    },
  });
}

/**
 * Convenience wrapper — count + score for one user.
 */
export async function getUserReputation(userId: string): Promise<ReputationResult> {
  const verifiedThreadCount = await countVerifiedThreadsByUser(userId);
  return {
    userId,
    verifiedThreadCount,
    reputationScore: calculateReputationScore(verifiedThreadCount),
  };
}

/**
 * Batch helper — map each userId to its reputation score.
 * Useful for rendering user cards / thread lists without N queries.
 */
export async function getReputationForUsers(userIds: string[]): Promise<Map<string, ReputationResult>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, ReputationResult>();
  if (unique.length === 0) return result;

  // Default every requested id to 0 so callers can distinguish "0" from missing.
  for (const id of unique) {
    result.set(id, { userId: id, verifiedThreadCount: 0, reputationScore: 0 });
  }

  const rows = await prisma.thread.groupBy({
    by: ['createdBy'],
    where: {
      createdBy: { in: unique },
      verifiedAt: { not: null },
      deletedAt: null,
    },
    _count: { createdBy: true },
  });

  for (const row of rows) {
    const uid = row.createdBy;
    if (!uid) continue;
    const count = (row._count as { createdBy: number }).createdBy ?? 0;
    result.set(uid, {
      userId: uid,
      verifiedThreadCount: count,
      reputationScore: calculateReputationScore(count),
    });
  }

  return result;
}

/**
 * Leaderboard — top users by verified thread count.
 * Queries the Thread table (not User) then hydrates user display fields.
 *
 * @param limit  number of entries (1–100, default 10)
 * @param offset pagination offset (default 0)
 */
export async function getLeaderboard(limit = 10, offset = 0): Promise<LeaderboardEntry[]> {
  const normalizedLimit = Math.min(Math.max(Math.floor(limit) || 10, 1), 100);
  const normalizedOffset = Math.max(Math.floor(offset) || 0, 0);

  const grouped = await prisma.thread.groupBy({
    by: ['createdBy'],
    where: {
      createdBy: { not: null },
      verifiedAt: { not: null },
      deletedAt: null,
    },
    _count: { createdBy: true },
    orderBy: { _count: { createdBy: 'desc' } },
    take: normalizedLimit,
    skip: normalizedOffset,
  });

  if (grouped.length === 0) return [];

  const userIds = grouped.map((g) => g.createdBy).filter((v): v is string => Boolean(v));

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, deletedAt: null },
    select: { id: true, name: true, image: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  const entries: LeaderboardEntry[] = [];
  for (const row of grouped) {
    const uid = row.createdBy;
    if (!uid) continue;
    const user = userMap.get(uid);
    // Skip soft-deleted users — still counted in groupBy but hidden from leaderboard
    if (!user) continue;
    const verifiedThreadCount = (row._count as { createdBy: number }).createdBy ?? 0;
    entries.push({
      userId: uid,
      name: user.name,
      image: user.image,
      verifiedThreadCount,
      reputationScore: calculateReputationScore(verifiedThreadCount),
    });
  }

  // Already descending by count, but re-sort after filtering soft-deleted users
  entries.sort((a, b) => b.verifiedThreadCount - a.verifiedThreadCount);
  return entries;
}
