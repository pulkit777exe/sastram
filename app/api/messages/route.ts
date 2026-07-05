import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/modules/messages/actions';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { rateLimit } from '@/lib/services/rate-limit';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { detectMimeTypeFromFile, getFileCategory, getExtensionFromMime } from '@/lib/utils/file-upload';

function errorCodeToStatus(errorCode: string | null): number {
  switch (errorCode) {
    case 'VALIDATION_ERROR': return 400;
    case 'AUTH_REQUIRED': return 401;
    case 'FORBIDDEN': return 403;
    case 'NOT_FOUND': return 404;
    case 'RATE_LIMITED': return 429;
    case 'INTERNAL_ERROR': return 500;
    default: return 500;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSessionOrThrow(false);

    const rateLimitResult = await rateLimit({ key: `message:${session.user.id}`, type: 'message' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many messages. Please slow down.'), { status: 429 });
    }

    const formData = await request.formData();

    const threadId = formData.get('threadId') as string;
    const rawContent = formData.get('content') as string;

    if (!threadId) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing threadId'), { status: 400 });
    }

    const files = formData.getAll('files') as File[];
    if (!rawContent?.trim() && files.length === 0) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing content or files'), { status: 400 });
    }

    const { sanitized: content } = sanitizeUserContent(rawContent || '');

    const postFormData = new FormData();
    if (content) postFormData.append('content', content);
    postFormData.append('threadId', threadId);
    const parentId = formData.get('parentId') as string | null;
    if (parentId) {
      postFormData.append('parentId', parentId);
    }

    // Handle pre-uploaded attachments (JSON) or raw files
    const existingAttachments = formData.get('attachments') as string | null;
    if (existingAttachments) {
      postFormData.append('attachments', existingAttachments);
    } else if (files.length > 0) {
      // Upload raw files and convert to attachment metadata
      const uploadedAttachments = await Promise.all(
        files.map(async (file) => {
          const detectedMime = await detectMimeTypeFromFile(file);
          const mimeForExt = detectedMime ?? file.type;
          const ext = getExtensionFromMime(mimeForExt);
          const key = `${randomUUID()}.${ext}`;
          const blob = await put(key, file, { access: 'public', addRandomSuffix: false });
          return {
            url: blob.url,
            type: getFileCategory(mimeForExt),
            name: file.name,
            size: file.size,
          };
        })
      );
      postFormData.append('attachments', JSON.stringify(uploadedAttachments));
    }

    const result = await postMessage(postFormData);

    if (!result || !result.ok) {
      const errorCode = (result && 'errorCode' in result && result.errorCode) || 'INTERNAL_ERROR';
      const status = errorCodeToStatus(errorCode);
      return NextResponse.json(fail(errorCode, result?.error || 'Failed to post message'), { status });
    }

    const resultData = (result as { data: { message: unknown } }).data;
    return NextResponse.json(ok({ message: resultData.message }));
  } catch (error) {
    const isAuth = error instanceof Error && error.message.includes('Unauthorized');
    return NextResponse.json(
      fail(isAuth ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR', isAuth ? 'Unauthorized' : 'Failed to post message'),
      { status: isAuth ? 401 : 500 }
    );
  }
}
