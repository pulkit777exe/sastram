import { prisma } from '@/lib/infrastructure/prisma';
import { createNotification } from '@/modules/notifications';
import { logger } from '@/lib/infrastructure/logger';

const ESCALATION_24H_MS = 24 * 60 * 60 * 1000;
const ESCALATION_72H_MS = 72 * 60 * 60 * 1000;

export async function escalateStaleReports(): Promise<{ escalated24h: number; escalated72h: number }> {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - ESCALATION_24H_MS);
  const cutoff72h = new Date(now.getTime() - ESCALATION_72H_MS);

  // Find reports pending > 24h that haven't been escalated yet
  const stale24h = await prisma.report.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff24h },
      escalatedAt: null,
    },
    select: { id: true, category: true, createdAt: true },
  });

  // Find reports pending > 72h (already escalated at 24h, need admin alert)
  const stale72h = await prisma.report.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff72h },
      escalatedAt: { not: null },
    },
    select: { id: true, category: true, createdAt: true },
  });

  // 24h escalation: re-notify moderators
  if (stale24h.length > 0) {
    await prisma.report.updateMany({
      where: { id: { in: stale24h.map(r => r.id) } },
      data: { escalatedAt: now },
    });

    const mods = await prisma.user.findMany({
      where: { role: { in: ['MODERATOR', 'ADMIN'] }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });

    await Promise.all(mods.map(mod =>
      createNotification({
        userId: mod.id,
        type: 'SYSTEM',
        title: `Escalation: ${stale24h.length} report(s) pending > 24h`,
        message: `${stale24h.length} reports need attention. Oldest: ${stale24h[0]?.category}`,
        data: { reportIds: stale24h.map(r => r.id), escalation: '24h' },
      })
    ));
  }

  // 72h escalation: notify admins specifically
  if (stale72h.length > 0) {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });

    await Promise.all(admins.map(admin =>
      createNotification({
        userId: admin.id,
        type: 'SYSTEM',
        title: `URGENT: ${stale72h.length} report(s) pending > 72h`,
        message: `${stale72h.length} reports are critically overdue. Immediate action required.`,
        data: { reportIds: stale72h.map(r => r.id), escalation: '72h' },
      })
    ));
  }

  logger.info('[moderation-sla]', { escalated24h: stale24h.length, escalated72h: stale72h.length });
  return { escalated24h: stale24h.length, escalated72h: stale72h.length };
}

export async function getSlaMetrics(): Promise<{
  totalPending: number;
  pendingOver24h: number;
  pendingOver72h: number;
  avgResponseTimeHours: number | null;
}> {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - ESCALATION_24H_MS);
  const cutoff72h = new Date(now.getTime() - ESCALATION_72H_MS);

  const [totalPending, pendingOver24h, pendingOver72h, resolvedReports] = await Promise.all([
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.report.count({ where: { status: 'PENDING', createdAt: { lt: cutoff24h } } }),
    prisma.report.count({ where: { status: 'PENDING', createdAt: { lt: cutoff72h } } }),
    prisma.report.findMany({
      where: { status: { in: ['RESOLVED', 'DISMISSED'] }, firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  let avgResponseTimeHours: number | null = null;
  if (resolvedReports.length > 0) {
    const totalMs = resolvedReports.reduce((sum, r) => {
      return sum + (r.firstResponseAt!.getTime() - r.createdAt.getTime());
    }, 0);
    avgResponseTimeHours = Math.round((totalMs / resolvedReports.length) / (1000 * 60 * 60) * 10) / 10;
  }

  return { totalPending, pendingOver24h, pendingOver72h, avgResponseTimeHours };
}
