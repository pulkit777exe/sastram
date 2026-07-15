/**
 * Admin module repository
 * Data access for admin operations
 */

import { prisma } from '@/lib/infrastructure/prisma';

export async function getAdminStats() {
  const [
    totalUsers,
    totalThreads,
    totalMessages,
    activeUsers24h,
    pendingReports,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.thread.count({ where: { deletedAt: null } }),
    prisma.message.count({ where: { deletedAt: null } }),
    prisma.user.count({
      where: {
        lastSeenAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.report.count({
      where: {
        status: 'PENDING',
      },
    }),
  ]);

  return {
    totalUsers,
    totalThreads,
    totalMessages,
    totalCommunities: 0,
    activeUsers24h,
    pendingReports,
  };
}
