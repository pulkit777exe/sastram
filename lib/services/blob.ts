import { put, del } from '@vercel/blob';
import { logger } from '@/lib/infrastructure/logger';

export interface UploadOptions {
  maxSizeBytes?: number;
  allowedTypes?: string[];
}

async function uploadFile(
  file: File,
  _options: UploadOptions = {}
): Promise<{ url: string; error?: string }> {
  try {
    const blob = await put(file.name, file, {
      access: 'public',
    });

    return { url: blob.url };
  } catch (error) {
    logger.error('Error uploading file:', error);
    return {
      url: '',
      error: 'Failed to upload file',
    };
  }
}

async function deleteFile(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    await del(url);
    return { success: true };
  } catch (error) {
    logger.error('Error deleting file:', error);
    return {
      success: false,
      error: 'Failed to delete file',
    };
  }
}
