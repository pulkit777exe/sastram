import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireModerator } from '@/lib/middleware/moderation';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import type { ReportStatus } from '@prisma/client';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireModerator();

  const status = (request.nextUrl.searchParams.get('status') as ReportStatus) || 'PENDING';

  const items = await prisma.report.findMany({
    where: { status },
    include: {
      message: {
        include: {
          sender: { select: { id: true, name: true, email: true } },
          thread: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json(ok({ items }));
});
