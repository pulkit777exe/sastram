import { NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';

export const GET = withErrorHandling(async () => {
  const session = await requireSessionOrThrow();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
  return NextResponse.json(ok(parseUserPreferences(user?.preferences)));
});
