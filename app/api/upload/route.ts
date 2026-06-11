import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { validateFileUpload, getFileCategory } from '@/lib/utils/file-upload';
import { uploadResponseSchema } from '@/lib/schemas/api';
import { logger } from '@/lib/infrastructure/logger';
import { randomUUID } from 'crypto';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { rateLimit } from '@/lib/services/rate-limit';

const handler = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionOrThrow();

  const rateLimitResult = await rateLimit({ key: `upload:${session.user.id}`, type: 'upload' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Upload limit reached. Please try again later.'), { status: 429 });
  }

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No files provided'), { status: 400 });
  }

  if (files.length > 10) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Maximum 10 files allowed'), { status: 400 });
  }

  for (const file of files) {
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      return NextResponse.json(fail('VALIDATION_ERROR', validation.error!), { status: 400 });
    }
  }

  const uploadedFiles = await Promise.all(
    files.map(async (file) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const key = ext ? `${randomUUID()}.${ext}` : randomUUID();
      const blob = await put(key, file, {
        access: 'public',
        addRandomSuffix: false,
      });

      const type = getFileCategory(file.type);

      return {
        url: blob.url,
        type,
        name: file.name,
        size: file.size,
      };
    })
  );

  const response = { files: uploadedFiles };
  const validatedResponse = uploadResponseSchema.safeParse(response);

  if (!validatedResponse.success) {
    logger.error('Invalid upload response:', validatedResponse.error.issues);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to process upload response'), { status: 500 });
  }

  return NextResponse.json(ok(validatedResponse.data));
});

export { handler as POST };

