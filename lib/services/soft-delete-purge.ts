import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Days past `deletedAt` before a soft-deleted Thread/User is destroyed for real.
 * There's no admin "undo" UI, so this window is the only recovery path — and it
 * also bounds storage against the 0.5 GB Neon free-tier cap.
 */
export const SOFT_DELETE_RETENTION_DAYS = 30;

const BATCH = 100;

/** Deletes in bounded batches so the full soft-deleted set never hits memory. */
async function purgeExpired(
  model: {
    findMany: (args: object) => Promise<{ id: string }[]>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  },
  cutoff: Date
): Promise<number> {
  let total = 0;

  while (true) {
    const rows = await model.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
      take: BATCH,
      orderBy: { deletedAt: 'asc' },
    });
    if (rows.length === 0) break;

    const { count } = await model.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    total += count;
    if (count < BATCH) break;
  }

  return total;
}

/**
 * Hard-deletes expired rows; related records follow via the schema's
 * onDelete: Cascade. Returns counts so the cron route logs them once.
 */
export async function purgeSoftDeleted(): Promise<{
  threads: number;
  users: number;
}> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const totalThreads = await purgeExpired(prisma.thread, cutoff);
  const totalUsers = await purgeExpired(prisma.user, cutoff);

  logger.info('[purge-soft-deleted]', {
    cutoff: cutoff.toISOString(),
    retentionDays: SOFT_DELETE_RETENTION_DAYS,
    threads: totalThreads,
    users: totalUsers,
  });

  return { threads: totalThreads, users: totalUsers };
}
