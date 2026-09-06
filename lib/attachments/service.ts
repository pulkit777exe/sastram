import { randomUUID } from 'crypto';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import {
  ALLOWED_MIME_TYPE_LIST,
  detectMimeTypeFromFile,
  getExtensionFromMime,
  getFileCategory,
  validateFileUpload,
  type FileCategory,
} from '@/lib/utils/file-upload';
import { AttachmentError, type StoredFile, type StoreOptions } from './types';
import type { AttachmentsDeps, BlobStore, ImageModerator } from './ports';
import { vercelBlobStore } from './adapters/vercel-blob';
import { aiModerator } from './adapters/ai-moderation';

// Policies per kind — single source of truth, replaces 3 scattered allowlists.
const POLICIES: Record<
  NonNullable<StoreOptions['kind']>,
  { allowedMimes: string[]; maxFiles: number; prefix?: string }
> = {
  message: {
    allowedMimes: ALLOWED_MIME_TYPE_LIST,
    maxFiles: 10,
  },
  avatar: {
    allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxFiles: 1,
    prefix: 'avatars',
  },
  banner: {
    allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxFiles: 1,
    prefix: 'banners',
  },
};

export function sanitize(dirty: string): string {
  return sanitizeUserContent(dirty).sanitized;
}

function getPolicy(kind: NonNullable<StoreOptions['kind']>) {
  const policy = POLICIES[kind];
  if (!policy) throw new AttachmentError(`Unknown attachment kind: ${kind}`, 'VALIDATION_ERROR', 400);
  return policy;
}

async function delSafe(store: BlobStore, url: string) {
  try {
    await store.del(url);
  } catch {
    // double-delete or network blip — swallow, rollback is best-effort
  }
}

function isAllowedForKind(mime: string, policy: { allowedMimes: string[] }): boolean {
  return policy.allowedMimes.includes(mime);
}

function getErrorCode(modResult: { reason?: string }): {
  errorCode: 'RATE_LIMITED' | 'FORBIDDEN';
  statusCode: number;
} {
  const reason = modResult.reason ?? '';
  // Quota failure has a single authoritative string from image-moderation.ts
  if (reason === 'Daily image moderation limit reached. Please try again tomorrow.') {
    return { errorCode: 'RATE_LIMITED', statusCode: 429 };
  }
  return { errorCode: 'FORBIDDEN', statusCode: 403 };
}

function validateFiles(files: File[], policy: { allowedMimes: string[]; maxFiles: number }) {
  if (!files || files.length === 0) return;
  if (files.length > policy.maxFiles) {
    throw new AttachmentError(`Maximum ${policy.maxFiles} files allowed`, 'VALIDATION_ERROR', 400);
  }
  for (const file of files) {
    if (!isAllowedForKind(file.type, policy)) {
      throw new AttachmentError(
        `File type ${file.type} is not supported. Allowed: images, GIFs, videos (MP4/WebM), and PDFs.`,
        'VALIDATION_ERROR',
        400
      );
    }
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      throw new AttachmentError(validation.error!, 'VALIDATION_ERROR', 400);
    }
  }
}

function buildFileKey(kind: string, policy: { prefix?: string }, ext: string): string {
  const isProfileImage = kind === 'avatar' || kind === 'banner';
  let prefix = '';
  if (isProfileImage) prefix = `${policy.prefix}/`;
  return `${prefix}${randomUUID()}.${ext}`;
}

async function uploadOne(key: string, file: File, storage: BlobStore): Promise<string> {
  const { url } = await storage.put(key, file);
  return url;
}

async function moderateOne(url: string, category: FileCategory, moderator: ImageModerator) {
  const modResult = await moderator.moderate(url, category);
  if (!modResult.allowed) {
    const { errorCode, statusCode } = getErrorCode(modResult);
    throw new AttachmentError(modResult.reason ?? 'Image rejected', errorCode, statusCode);
  }
  return modResult;
}

export function createAttachments(deps: AttachmentsDeps = { storage: vercelBlobStore, moderator: aiModerator }) {
  async function store(files: File[], opts: StoreOptions = {}): Promise<StoredFile[]> {
    const kind = opts.kind ?? 'message';
    const policy = getPolicy(kind);
    validateFiles(files, policy);
    if (!files || files.length === 0) return [];
    const uploaded: StoredFile[] = [];
    try {
      for (const file of files) {
        const detected = await detectMimeTypeFromFile(file);
        if (detected && detected !== file.type) {
          logger.warn('[attachments] MIME mismatch', { declared: file.type, detected, filename: file.name });
          throw new AttachmentError('File content does not match declared type', 'VALIDATION_ERROR', 400);
        }
        const mimeForExt = detected ?? file.type;
        if (!isAllowedForKind(mimeForExt, policy)) {
          throw new AttachmentError(`File type ${mimeForExt} is not supported for ${kind}`, 'VALIDATION_ERROR', 400);
        }
        const ext = getExtensionFromMime(mimeForExt);
        const category = getFileCategory(mimeForExt) as FileCategory;
        const key = buildFileKey(kind, policy, ext);
        const url = await uploadOne(key, file, deps.storage);
        const entry: StoredFile = { url, type: category, name: file.name, size: file.size };
        uploaded.push(entry);
        if (category === 'IMAGE' || category === 'GIF') {
          const modResult = await moderateOne(url, category, deps.moderator);
          if (modResult.flagged) entry.flagged = true;
        }
      }
    } catch (error) {
      await Promise.all(uploaded.map((f) => delSafe(deps.storage, f.url)));
      if (error instanceof AppError) throw error;
      throw new AttachmentError('Failed to store files', 'INTERNAL_ERROR', 500);
    }
    return uploaded;
  }

  return { sanitize, store };
}

// Eager singleton for callers that don't need test injection — same Seam, same Interface.
const defaultAttachments = createAttachments();

export const sanitizeDefault = defaultAttachments.sanitize;
export const storeDefault = defaultAttachments.store;
