import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/services/auth';
import { withErrorHandling, successResponse, validationErrorResponse, unauthorizedResponse } from '@/lib/utils/api-response';
import { searchThreads, searchMessages, searchUsers } from '@/modules/search/repository';
import { prisma } from '@/lib/infrastructure/prisma';

const _getHandler = await withErrorHandling(async (request: NextRequest) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return await unauthorizedResponse();
  }

  // Get user's section memberships to scope search
  const memberships = await prisma.sectionMember.findMany({
    where: { userId: session.user.id },
    select: { sectionId: true },
  });
  const sectionIds = memberships.map((m) => m.sectionId);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const type = searchParams.get('type') || 'threads';
  const threadId = searchParams.get('threadId') || undefined;
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  if (!q || q.trim().length === 0) {
    return validationErrorResponse(['Missing query parameter: q']);
  }

  if (q.length > 200) {
    return validationErrorResponse(['Query too long (max 200 characters)']);
  }

  switch (type) {
    case 'threads': {
      const result = await searchThreads(q, limit, offset, sectionIds);
      return successResponse(result);
    }
    case 'messages': {
      const result = await searchMessages(q, threadId, limit, offset, sectionIds);
      return successResponse(result);
    }
    case 'users': {
      const result = await searchUsers(q, limit, offset);
      return successResponse(result);
    }
    default:
      return validationErrorResponse([
        `Invalid type: ${type}. Must be one of: threads, messages, users`,
      ]);
  }
});

export const GET = _getHandler;
