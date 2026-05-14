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
    totalCommunities,
    activeUsers24h,
    pendingReports,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.section.count(),
    prisma.message.count({ where: { deletedAt: null } }),
    prisma.community.count(),
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
    totalCommunities,
    activeUsers24h,
    pendingReports,
  };
}
