import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/modules/messages/actions';
import { requireSession } from '@/modules/auth/session';
import { ok, fail } from '@/lib/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }

    const formData = await request.formData();

    const threadId = formData.get('threadId') as string;
    const body = formData.get('body') as string;

    if (!threadId) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing threadId'), { status: 400 });
    }

    const files = formData.getAll('files') as File[];
    if (!body?.trim() && files.length === 0) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing body or files'), { status: 400 });
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
      return NextResponse.json(fail('INTERNAL_ERROR', result?.error || 'Failed to post message'), { status: 500 });
    }

    return NextResponse.json(ok({ message: (result as unknown as { data: { id: string; content: string; senderId: string; senderName: string; senderAvatar: string | null; createdAt: Date; sectionId: string } }).data }));
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to post message'), { status: 500 });
  }
}
