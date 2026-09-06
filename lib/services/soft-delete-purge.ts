import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Days past `deletedAt` before a soft-deleted Thread/User is destroyed for real.
 * There's no admin "undo" UI, so this window is the only recovery path — and it
 * also bounds storage against the 0.5 GB Neon free-tier cap.
 */
export const SOFT_DELETE_RETENTION_DAYS = 30;

const PURGE_BATCH_SIZE = 100; // keeps each query bounded for Neon free-tier
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Deletes in bounded batches so the full soft-deleted set never hits memory. */
async function purgeExpired(
  prismaModel: {
    findMany: (args: object) => Promise<{ id: string }[]>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  },
  cutoff: Date
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const foundRows = await prismaModel.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
      take: PURGE_BATCH_SIZE,
      orderBy: { deletedAt: 'asc' },
    });
    if (foundRows.length === 0) break;

    const foundIds = foundRows.map((row) => row.id);
    const { count: deletedCount } = await prismaModel.deleteMany({
      where: { id: { in: foundIds } },
    });
    totalDeleted += deletedCount;
    if (deletedCount < PURGE_BATCH_SIZE) break;
  }

  return totalDeleted;
}

/**
 * Hard-deletes expired rows; related records follow via the schema's
 * onDelete: Cascade. Returns counts so the cron route logs them once.
 */
export async function purgeSoftDeleted(): Promise<{
  threads: number;
  users: number;
}> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * MS_PER_DAY);

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
