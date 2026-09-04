import { FILE_LIMITS } from '@/lib/config/constants';

const MAX_FILE_SIZES = {
  IMAGE: FILE_LIMITS.MAX_IMAGE_SIZE,
  GIF: FILE_LIMITS.MAX_IMAGE_SIZE,
  VIDEO: FILE_LIMITS.MAX_VIDEO_SIZE,
  PDF: FILE_LIMITS.MAX_PDF_SIZE,
  FILE: FILE_LIMITS.MAX_SIZE_BYTES,
};

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  GIF: ['image/gif'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
  PDF: ['application/pdf'],
};

export const ALLOWED_MIME_TYPE_LIST: string[] = Object.values(ALLOWED_MIME_TYPES).flat();

export type FileCategory = 'IMAGE' | 'GIF' | 'VIDEO' | 'PDF' | 'FILE';

export function getFileCategory(mimeType: string): FileCategory {
  if (ALLOWED_MIME_TYPES.IMAGE.includes(mimeType)) {
    if (mimeType === 'image/gif') return 'GIF';
    return 'IMAGE';
  }
  if (ALLOWED_MIME_TYPES.VIDEO.includes(mimeType)) {
    return 'VIDEO';
  }
  if (ALLOWED_MIME_TYPES.PDF.includes(mimeType)) {
    return 'PDF';
  }
  return 'FILE';
}

const MAGIC_BYTES: { mime: string; bytes: number[]; offset: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ftyp at offset 4
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 }, // EBML header
];

const BYTES_PER_MB = 1024 * 1024;

function bytesMatchSignature(bytes: number[], sig: { bytes: number[]; offset: number }): boolean {
  for (let i = 0; i < sig.bytes.length; i++) {
    if (bytes[sig.offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}

/** Sniffs the real type — a client-supplied `file.type` can lie. */
export async function detectMimeTypeFromFile(file: File): Promise<string | null> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = Array.from(new Uint8Array(buffer));

  const matched = MAGIC_BYTES.find((sig) => bytesMatchSignature(bytes, sig));
  if (matched) return matched.mime;
  return null;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

/** Derived from MIME rather than the user-supplied filename. */
export function getExtensionFromMime(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? 'bin';
}

export function validateFileUpload(file: File): {
  valid: boolean;
  error?: string;
} {
  const category = getFileCategory(file.type);
  const maxSize = MAX_FILE_SIZES[category];

  if (!ALLOWED_MIME_TYPE_LIST.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported. Allowed: images, GIFs, videos (MP4/WebM), and PDFs.`,
    };
  }

  if (file.size > maxSize) {
    const maxSizeMB = Math.floor(maxSize / BYTES_PER_MB);
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit for ${category} files.`,
    };
  }

  return { valid: true };
}
