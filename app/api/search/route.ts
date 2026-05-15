import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, successResponse, validationErrorResponse } from '@/lib/utils/api-response';
import { searchThreads, searchMessages, searchUsers } from '@/modules/search/repository';

export const GET = withErrorHandling(async (request: NextRequest) => {
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
      const result = await searchThreads(q, limit, offset);
      return successResponse(result);
    }
    case 'messages': {
      const result = await searchMessages(q, threadId, limit, offset);
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
