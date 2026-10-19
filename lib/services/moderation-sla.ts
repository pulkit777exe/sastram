import { prisma } from '@/lib/infrastructure/prisma';

const ESCALATION_24H_MS = 24 * 60 * 60 * 1000;
const ESCALATION_72H_MS = 72 * 60 * 60 * 1000;

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
    // pendingOver24h is 24-72h bucket (exclusive of 72h) to avoid overlap double-count with pendingOver72h
    prisma.report.count({ where: { status: 'PENDING', createdAt: { lt: cutoff24h, gte: cutoff72h } } }),
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
    let totalMs = 0;
    for (const report of resolvedReports) {
      const responseTimeMs = report.firstResponseAt
        ? report.firstResponseAt.getTime()
        : report.createdAt.getTime();
      const elapsedMs = responseTimeMs - report.createdAt.getTime();
      totalMs += elapsedMs;
    }
    const avgMs = totalMs / resolvedReports.length;
    const MS_PER_HOUR = 1000 * 60 * 60;
    const avgHours = avgMs / MS_PER_HOUR;
    avgResponseTimeHours = Math.round(avgHours * 10) / 10;
  }

  return { totalPending, pendingOver24h, pendingOver72h, avgResponseTimeHours };
}
