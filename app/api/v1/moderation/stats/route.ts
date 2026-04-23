import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/middleware/moderation';
import { ok, fail } from '@/lib/http/api-response';
import { prisma } from '@/lib/infrastructure/prisma';

export async function GET() {
  try {
    await requireModerator();
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Moderator access required'), { status: 403 });
  }

  try {
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
  } catch (error) {
    console.error('[GET_MODERATION_STATS]', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to load moderation stats', error), {
      status: 500,
    });
  }
}
