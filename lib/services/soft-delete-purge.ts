import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Soft-delete retention window. After this many days past `deletedAt`,
 * soft-deleted Thread/Community rows are permanently removed (cascade clears
 * dependent rows exactly as the prior hard-delete did).
 *
 * Set deliberately to 30 days per product/legal decision — a recoverable
 * safety buffer with no admin-facing "undo" UI in this build.
 *
 * INFERRED-NEEDED: this gates the storage bound on the 0.5 GB Neon free-tier cap.
 * Adjusting this value to be more aggressive (e.g. 7) tightens the bound further.
 */
export const SOFT_DELETE_RETENTION_DAYS = 30;

/**
 * Hard-delete soft-deleted rows whose `deletedAt` is older than the retention window.
 *
 * Cascade chain (matches the existing schema's onDelete: Cascade settings):
 * - Thread → Message, ThreadMember, ThreadInvitation, UserBan(threadId),
 *            UserBookmark, ThreadTagRelation, Poll, ThreadSubscription,
 *            ReadReceipt, ThreadRelation
 * - Community → Thread (and Thread cascade chain above)
 *
 * Bounded batches so we never load the full soft-deleted set into memory.
 *
 * Returns counts so the calling cron route can log them once.
 */
export async function purgeSoftDeleted(): Promise<{
  threads: number;
  communities: number;
}> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const BATCH = 100;
  let totalThreads = 0;
  let totalCommunities = 0;

  // Purge communities first so any thread referencing them via FK does not
  // require a separate cleanup pass (community cascade clears its threads).
  while (true) {
    const communities = await prisma.community.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
      take: BATCH,
      orderBy: { deletedAt: 'asc' },
    });
    if (communities.length === 0) break;

    const result = await prisma.community.deleteMany({
      where: { id: { in: communities.map((c) => c.id) } },
    });
    totalCommunities += result.count;
    if (result.count < BATCH) break;
  }

  while (true) {
    const threads = await prisma.thread.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
      take: BATCH,
      orderBy: { deletedAt: 'asc' },
    });
    if (threads.length === 0) break;

    const result = await prisma.thread.deleteMany({
      where: { id: { in: threads.map((t) => t.id) } },
    });
    totalThreads += result.count;
    if (result.count < BATCH) break;
  }

  logger.info('[purge-soft-deleted]', {
    cutoff: cutoff.toISOString(),
    retentionDays: SOFT_DELETE_RETENTION_DAYS,
    threads: totalThreads,
    communities: totalCommunities,
  });

  return { threads: totalThreads, communities: totalCommunities };
}
