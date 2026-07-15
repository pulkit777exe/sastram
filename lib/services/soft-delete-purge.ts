import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Soft-delete retention window. After this many days past `deletedAt`,
 * soft-deleted Thread/User rows are permanently removed.
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
 * - User → Account, Session, Message(senderId→null), Reaction,
 *          ReadReceipt, UserFollow, UserBookmark, Notification, ThreadSubscription,
 *          Appeal(userId/moderatorId→null), Report(reporterId→null),
 *          UserBan(userId/bannedBy→null), PollVote, UserActivity,
 *          ThreadInvitation, AiSearchSession, UserReputation, UserBadgeEarned
 * - Thread → Message, ThreadInvitation, UserBan(threadId),
 *            UserBookmark, ThreadTagRelation, Poll, ThreadSubscription,
 *            ReadReceipt, ThreadRelation
 * Bounded batches so we never load the full soft-deleted set into memory.
 *
 * Returns counts so the calling cron route can log them once.
 */
export async function purgeSoftDeleted(): Promise<{
  threads: number;
  users: number;
}> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const BATCH = 100;
  let totalThreads = 0;
  let totalUsers = 0;

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

  while (true) {
    const users = await prisma.user.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
      take: BATCH,
      orderBy: { deletedAt: 'asc' },
    });
    if (users.length === 0) break;

    const result = await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    totalUsers += result.count;
    if (result.count < BATCH) break;
  }

  logger.info('[purge-soft-deleted]', {
    cutoff: cutoff.toISOString(),
    retentionDays: SOFT_DELETE_RETENTION_DAYS,
    threads: totalThreads,
    users: totalUsers,
  });

  return { threads: totalThreads, users: totalUsers };
}
