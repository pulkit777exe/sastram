import { NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import { rateLimit } from '@/lib/services/rate-limit';

export const GET = withErrorHandling(async () => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `user-preferences:${session.user.id}`, type: 'api' });
  if (!rl.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
  return NextResponse.json(ok(parseUserPreferences(user?.preferences)));
});
