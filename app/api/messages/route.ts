import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/modules/messages/actions';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { rateLimit } from '@/lib/services/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSessionOrThrow(false);

    const rateLimitResult = await rateLimit({ key: `message:${session.user.id}`, type: 'message' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many messages. Please slow down.'), { status: 429 });
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
    postFormData.append('threadId', threadId);
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

    const resultData = (result as { data: { message: unknown } }).data;
    return NextResponse.json(ok({ message: resultData.message }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json(
      fail(status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR', message),
      { status }
    );
  }
}
