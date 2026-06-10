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
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json(
      fail(status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR', message, undefined, requestId),
      { status }
    );
  }
}
