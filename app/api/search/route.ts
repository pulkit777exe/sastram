import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/services/auth';
import { ok, fail } from '@/lib/utils/api-response';
import { searchThreads, searchMessages, searchUsers } from '@/modules/search/repository';
import { prisma } from '@/lib/infrastructure/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const type = searchParams.get('type') || 'threads';
    const threadId = searchParams.get('threadId') || undefined;
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
    const offset = Number(searchParams.get('offset')) || 0;

    if (!q || q.trim().length === 0) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing query parameter: q'), { status: 400 });
    }

    if (q.length > 200) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Query too long (max 200 characters)'), { status: 400 });
    }

    if (!['threads', 'messages', 'users'].includes(type)) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', `Invalid type: ${type}. Must be one of: threads, messages, users`),
        { status: 400 }
      );
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }

    const memberships = await prisma.threadMember.findMany({
      where: { userId: session.user.id },
      select: { threadId: true },
    });
    const threadIds = memberships.map((m) => m.threadId);

    switch (type) {
      case 'threads': {
        const result = await searchThreads(q, limit, offset, threadIds);
        return NextResponse.json(ok(result));
      }
      case 'messages': {
        const result = await searchMessages(q, threadId, limit, offset, threadIds);
        return NextResponse.json(ok(result));
      }
      case 'users': {
        const result = await searchUsers(q, limit, offset);
        return NextResponse.json(ok(result));
      }
      default:
        return NextResponse.json(
          fail('VALIDATION_ERROR', `Invalid type: ${type}. Must be one of: threads, messages, users`),
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Search failed'), { status: 500 });
  }
}
