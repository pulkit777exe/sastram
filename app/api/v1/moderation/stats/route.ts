import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/middleware/moderation';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';

export const GET = withErrorHandling(async () => {
  await requireModerator();

  const [pendingReports, activeBans, resolvedReports, totalRules] = await Promise.all([
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.userBan.count({ where: { isActive: true } }),
    prisma.report.count({ where: { status: 'RESOLVED' } }),
    prisma.moderationRule.count(),
  ]);

  const latestStats = [
    { label: 'Pending Reports', value: pendingReports },
    { label: 'Active Bans', value: activeBans },
    { label: 'Resolved Reports', value: resolvedReports },
    { label: 'Moderation Rules', value: totalRules },
  ];

  return NextResponse.json(
    ok({
      latestStats,
      queueSize: pendingReports,
    })
  );
});
