import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/services/auth';
import { put } from '@vercel/blob';
import { validateFileUpload, getFileCategory } from '@/lib/utils/file-upload';
import { uploadResponseSchema } from '@/lib/schemas/api';
import { logger } from '@/lib/infrastructure/logger';

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 files allowed' }, { status: 400 });
    }

    for (const file of files) {
      const validation = validateFileUpload(file);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const blob = await put(file.name, file, {
          access: 'public',
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
      return NextResponse.json({ error: 'Failed to process upload response' }, { status: 500 });
    }

    return NextResponse.json(validatedResponse.data);
  } catch (error) {
    logger.error('Error uploading files:', error);
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 });
  }
}

