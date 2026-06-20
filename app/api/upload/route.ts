import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { validateFileUpload, getFileCategory, detectMimeTypeFromFile, getExtensionFromMime } from '@/lib/utils/file-upload';
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
      // Verify file content matches declared MIME type via magic bytes
      const detectedMime = await detectMimeTypeFromFile(file);
      if (detectedMime && detectedMime !== file.type) {
        logger.warn('[upload] MIME mismatch', {
          declared: file.type,
          detected: detectedMime,
          filename: file.name,
        });
        // Reject: declared type doesn't match actual content
        throw new Error(`File content does not match declared type. Detected: ${detectedMime}`);
      }

      // Derive extension from detected or declared MIME type, not from filename
      const mimeForExt = detectedMime ?? file.type;
      const ext = getExtensionFromMime(mimeForExt);
      const key = `${randomUUID()}.${ext}`;

      const blob = await put(key, file, {
        access: 'public',
        addRandomSuffix: false,
      });

      const type = getFileCategory(mimeForExt);

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

