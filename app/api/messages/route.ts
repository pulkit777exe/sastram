import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/modules/messages/actions';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { trackNeonRequest } from '@/lib/services/usage-check';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { AppError } from '@/lib/utils/errors';
import { put, del } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { detectMimeTypeFromFile, getFileCategory, getExtensionFromMime, validateFileUpload, type FileCategory } from '@/lib/utils/file-upload';
import { logger } from '@/lib/infrastructure/logger';
import { moderateImageUpload } from '@/lib/services/image-moderation';

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
    const session = await requireSessionOrThrow();

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

    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

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
      if (files.length > 10) {
        return NextResponse.json(fail('VALIDATION_ERROR', 'Maximum 10 files allowed'), { status: 400 });
      }

      for (const file of files) {
        const validation = validateFileUpload(file);
        if (!validation.valid) {
          return NextResponse.json(fail('VALIDATION_ERROR', validation.error!), { status: 400 });
        }
      }

      // Sequential so a rejected/crashed moderation never strands concurrently
      // uploading blobs: every uploaded file is fully moderated before the next.
      const uploadedAttachments: Array<{
        url: string;
        type: FileCategory;
        name: string;
        size: number;
      }> = [];
      try {
        for (const file of files) {
          const detectedMime = await detectMimeTypeFromFile(file);
          const mimeForExt = detectedMime ?? file.type;
          const ext = getExtensionFromMime(mimeForExt);
          const key = `${randomUUID()}.${ext}`;
          const blob = await put(key, file, { access: 'public', addRandomSuffix: false });

          const fileCategory = getFileCategory(mimeForExt);
          const modResult = await moderateImageUpload(blob.url, fileCategory);
          if (!modResult.allowed) {
            throw new AppError(modResult.reason ?? 'Image rejected', 'FORBIDDEN', 403);
          }

          uploadedAttachments.push({
            url: blob.url,
            type: fileCategory,
            name: file.name,
            size: file.size,
          });
        }
      } catch (error) {
        // The batch failed — don't strand already-uploaded blobs as storage garbage.
        await Promise.all(uploadedAttachments.map((a) => del(a.url).catch(() => {})));
        throw error;
      }
      postFormData.append('attachments', JSON.stringify(uploadedAttachments));
    }

    const result = await postMessage(postFormData);
    void trackNeonRequest(); // best-effort usage tracking

    if (!result || !result.ok) {
      const errorCode = (result && 'errorCode' in result && result.errorCode) || 'INTERNAL_ERROR';
      const status = errorCodeToStatus(errorCode);
      return NextResponse.json(fail(errorCode, result?.error || 'Failed to post message'), { status });
    }

    const resultData = (result as { data: { message: unknown } }).data;
    return NextResponse.json(ok({ message: resultData.message }));
  } catch (error) {
    // AppErrors (auth, thread access, moderation rejections) carry a
    // user-facing message and status; everything else stays generic.
    if (AppError.isAppError(error)) {
      if (error.statusCode >= 500) logger.error('[messages] POST failed', error);
      return NextResponse.json(fail(error.code ?? 'INTERNAL_ERROR', error.message), {
        status: error.statusCode,
      });
    }
    logger.error('[messages] POST failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to post message'), { status: 500 });
  }
}
