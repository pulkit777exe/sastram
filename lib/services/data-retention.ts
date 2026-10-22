import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 1000;
const MAX_BATCHES = 5; // at most 5k rows/model per cron invocation

export interface RetentionResult {
  sessions: number;
  verifications: number;
  aiSearchResults: number;
  aiSearchSessions: number;
  invitations: number;
  readNotifications: number;
}

async function drain(
  label: string,
  findIds: () => Promise<{ id: string }[]>,
  deleteIds: (ids: string[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await findIds();
    if (rows.length === 0) break;
    try {
      const result = await deleteIds(rows.map((row) => row.id));
      total += result.count;
    } catch (error) {
      logger.error(`[retention] ${label} delete failed`, error);
      break;
    }
  }
  return total;
}

/**
 * Bounded retention for ephemeral tables that previously grew forever:
 * Better Auth sessions/verifications, AI search cache/history, expired
 * invitations, and old read notifications. Runs before the update-threads
 * fan-out so a busy AI run cannot starve it.
 */
export async function purgeExpiredData(now = new Date()): Promise<RetentionResult> {
  const sessionCutoff = now;
  const aiSearchSessionCutoff = new Date(now.getTime() - 30 * MS_PER_DAY);
  const invitationCutoff = new Date(now.getTime() - 30 * MS_PER_DAY);
  const notificationCutoff = new Date(now.getTime() - 90 * MS_PER_DAY);

  const sessions = await drain(
    'sessions',
    () =>
      prisma.session.findMany({
        where: { expiresAt: { lt: sessionCutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.session.deleteMany({ where: { id: { in: ids } } })
  );

  const verifications = await drain(
    'verifications',
    () =>
      prisma.verification.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.verification.deleteMany({ where: { id: { in: ids } } })
  );

  const aiSearchResults = await drain(
    'aiSearchResults',
    () =>
      prisma.aiSearchResult.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.aiSearchResult.deleteMany({ where: { id: { in: ids } } })
  );

  const aiSearchSessions = await drain(
    'aiSearchSessions',
    () =>
      prisma.aiSearchSession.findMany({
        where: { deletedAt: { lt: aiSearchSessionCutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.aiSearchSession.deleteMany({ where: { id: { in: ids } } })
  );

  const invitations = await drain(
    'invitations',
    () =>
      prisma.threadInvitation.findMany({
        where: { expiresAt: { lt: invitationCutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.threadInvitation.deleteMany({ where: { id: { in: ids } } })
  );

  const readNotifications = await drain(
    'readNotifications',
    () =>
      prisma.notification.findMany({
        where: { isRead: true, createdAt: { lt: notificationCutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.notification.deleteMany({ where: { id: { in: ids } } })
  );

  const result = {
    sessions,
    verifications,
    aiSearchResults,
    aiSearchSessions,
    invitations,
    readNotifications,
  };
  if (Object.values(result).some((count) => count > 0)) {
    logger.info('[retention] purged expired rows', result);
  }
  return result;
}
