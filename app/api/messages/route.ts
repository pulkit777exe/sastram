import { NextRequest } from 'next/server';
import { postMessage } from '@/modules/messages/actions';
import { requireSession } from '@/modules/auth/session';
import { withErrorHandling, successResponse, unauthorizedResponse, errorResponse, validationErrorResponse } from '@/lib/utils/api-response';

interface PostMessageResult {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  createdAt: Date;
  sectionId: string;
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSession();
  if (!session.user) {
    return unauthorizedResponse();
  }

  const formData = await request.formData();

  const threadId = formData.get('threadId') as string;
  const body = formData.get('body') as string;

  if (!threadId) {
    return validationErrorResponse(['Missing threadId']);
  }

  const files = formData.getAll('files') as File[];
  if (!body?.trim() && files.length === 0) {
    return validationErrorResponse(['Missing body or files']);
  }

  const postFormData = new FormData();
  if (body) postFormData.append('content', body);
  postFormData.append('sectionId', threadId);
  const parentId = formData.get('parentId') as string | null;
  if (parentId) {
    postFormData.append('parentId', parentId);
  }
  for (const file of files) {
    postFormData.append('files', file);
  }

  const result = await postMessage(postFormData);

  if (!result || ('error' in result && result.error)) {
    return errorResponse(result?.error || 'Failed to post message');
  }

  const typedResult = result as { data: PostMessageResult };
  return successResponse({ message: typedResult.data });
});
