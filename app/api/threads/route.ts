import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/services/auth';
import { listThreads } from '@/modules/threads/repository';
import { ok, fail } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const requestId = request.headers.get('x-request-id') ?? '';

  if (!session) {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized', undefined, requestId), {
      status: 401,
    });
  }

  try {
    // Scope threads to user's memberships
    const memberships = await prisma.threadMember.findMany({
      where: { userId: session.user.id },
      select: { threadId: true },
    });
    const threadIds = memberships.map((m) => m.threadId);

    const threads = await listThreads({ memberUserId: session.user.id, threadIds });
    return NextResponse.json(ok({ threads }, requestId));
  } catch (error) {
    return NextResponse.json(
      fail('INTERNAL_ERROR', 'Failed to load threads', undefined, requestId),
      { status: 500 }
    );
  }
}
