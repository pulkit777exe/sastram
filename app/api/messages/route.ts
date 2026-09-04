import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/modules/messages/actions';
import { ok, fail, errorCodeToStatus, HTTP_STATUS } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { trackNeonRequest } from '@/lib/services/usage-check';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { sanitize, store } from '@/lib/attachments';

async function authenticateRequest() {
  return requireSessionOrThrow();
}

async function checkRateLimitOrThrow(session: Awaited<ReturnType<typeof requireSessionOrThrow>>) {
  const rateLimitResult = await rateLimit({ key: `message:${session.user.id}`, type: 'message' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many messages. Please slow down.'), { status: HTTP_STATUS.RATE_LIMITED });
  }
  return null;
}

function validateFormInputs(formData: FormData): { threadId: string; rawContent: string; files: File[] } | NextResponse {
  const threadId = formData.get('threadId') as string;
  if (!threadId) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Missing threadId'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const rawContent = formData.get('content') as string;
  const files = formData.getAll('files') as File[];
  if (!rawContent?.trim() && files.length === 0) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Missing content or files'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  return { threadId, rawContent, files };
}

async function buildPostFormData(formData: FormData, threadId: string, rawContent: string, files: File[]): Promise<FormData> {
  const content = sanitize(rawContent || '');
  const postFormData = new FormData();
  if (content) postFormData.append('content', content);
  postFormData.append('threadId', threadId);
  const parentId = formData.get('parentId') as string | null;
  if (parentId) {
    postFormData.append('parentId', parentId);
  }
  const existingAttachments = formData.get('attachments') as string | null;
  if (existingAttachments) {
    postFormData.append('attachments', existingAttachments);
  } else if (files.length > 0) {
    const uploadedAttachments = await store(files, { kind: 'message' });
    postFormData.append('attachments', JSON.stringify(uploadedAttachments));
  }
  return postFormData;
}

function handleActionError(result: { ok: boolean; error?: string; errorCode?: string } | null): NextResponse | null {
  if (!result || !result.ok) {
    let errorCode: string;
    if (result && 'errorCode' in result && result.errorCode) {
      errorCode = result.errorCode as string;
    } else {
      errorCode = 'INTERNAL_ERROR';
    }
    const status = errorCodeToStatus(errorCode);
    let errorMessage: string;
    if (result && result.error) {
      errorMessage = result.error;
    } else {
      errorMessage = 'Failed to post message';
    }
    return NextResponse.json(fail(errorCode, errorMessage), { status });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest();

    const rateLimitResponse = await checkRateLimitOrThrow(session);
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const validated = validateFormInputs(formData);
    if (validated instanceof NextResponse) return validated;
    const { threadId, rawContent, files } = validated;

    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

    const postFormData = await buildPostFormData(formData, threadId, rawContent, files);

    const result = await postMessage(postFormData);
    void trackNeonRequest();

    const actionError = handleActionError(result as unknown as { ok: boolean; error?: string; errorCode?: string } | null);
    if (actionError) return actionError;

    const resultData = (result as { data: { message: unknown } }).data;
    return NextResponse.json(ok({ message: resultData.message }));
  } catch (error) {
    if (AppError.isAppError(error)) {
      if (error.statusCode >= HTTP_STATUS.INTERNAL) {
        logger.error('[messages] POST failed', error);
      }
      let errorCode: string;
      if (error.code) {
        errorCode = error.code;
      } else {
        errorCode = 'INTERNAL_ERROR';
      }
      return NextResponse.json(fail(errorCode, error.message), { status: error.statusCode });
    }
    logger.error('[messages] POST failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to post message'), { status: HTTP_STATUS.INTERNAL });
  }
}
