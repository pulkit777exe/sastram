import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireModerator } from '@/lib/middleware/moderation';
import { fail, ok, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { ReportStatus } from '@prisma/client';
import { z } from 'zod';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireModerator();

  const rawStatus = request.nextUrl.searchParams.get('status');
  const statusSchema = z.nativeEnum(ReportStatus);
  let status: ReportStatus = 'PENDING';
  if (rawStatus !== null && rawStatus !== '') {
    const parsed = statusSchema.safeParse(rawStatus);
    if (!parsed.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid status'), { status: HTTP_STATUS.BAD_REQUEST });
    status = parsed.data;
  }

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
