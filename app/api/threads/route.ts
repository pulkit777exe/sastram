import { NextRequest, NextResponse } from 'next/server';
import { listThreads } from '@/modules/threads/repository';
import { ok, fail } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSessionOrThrow } from '@/modules/auth/session';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? '';

  try {
    const session = await requireSessionOrThrow();

    // Scope threads to user's memberships
    const memberships = await prisma.threadMember.findMany({
      where: { userId: session.user.id },
      select: { threadId: true },
    });
    const threadIds = memberships.map((m) => m.threadId);

    const threads = await listThreads({ memberUserId: session.user.id, threadIds });
    return NextResponse.json(ok({ threads }, requestId));
  } catch (error) {
    const isAuth = error instanceof Error && error.message.includes('Unauthorized');
    return NextResponse.json(
      fail(isAuth ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR', isAuth ? 'Unauthorized' : 'Failed to load threads', undefined, requestId),
      { status: isAuth ? 401 : 500 }
    );
  }
}
