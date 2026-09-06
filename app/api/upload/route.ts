import { NextRequest, NextResponse } from 'next/server';
import { uploadResponseSchema } from '@/lib/schemas/api';
import { logger } from '@/lib/infrastructure/logger';
import { ok, fail, withErrorHandling, HTTP_STATUS} from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { store } from '@/lib/attachments';

const handler = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionOrThrow();

  const rateLimitResult = await rateLimit({ key: `upload:${session.user.id}`, type: 'upload' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Upload limit reached. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
  }

  const formData = await req.formData();
  const threadId = formData.get('threadId') as string;
  const files = formData.getAll('files') as File[];

  if (!threadId) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Missing threadId'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

  if (!files || files.length === 0) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No files provided'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  // Deep Module: single seam hides validate→sniff→ext→put→moderate→rollback.
  // Previously 60 lines duplicated in /api/messages; now one call, atomic batch.
  const uploadedFiles = await store(files, { kind: 'message' });

  const response = { files: uploadedFiles };
  const validatedResponse = uploadResponseSchema.safeParse(response);

  if (!validatedResponse.success) {
    logger.error('Invalid upload response:', validatedResponse.error.issues);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to process upload response'), { status: HTTP_STATUS.INTERNAL });
  }

  return NextResponse.json(ok(validatedResponse.data));
});

export { handler as POST };

