import { AppError } from '@/lib/utils/errors';
import type { FileCategory } from '@/lib/utils/file-upload';

export type StoredFile = {
  url: string;
  type: FileCategory;
  name: string;
  size: number;
  flagged?: true;
};

export type AttachmentKind = 'message' | 'avatar' | 'banner';

export type StoreOptions = {
  kind?: AttachmentKind;
  /** Attribution for per-user moderation quotas; required for image uploads. */
  userId?: string;
};

export class AttachmentError extends AppError {
  constructor(message: string, code: string, statusCode: number) {
    super(message, code, statusCode);
    this.name = 'AttachmentError';
  }
}
