import sanitizeHtml from 'sanitize-html';
import { FILE_LIMITS } from '@/lib/config/constants';

export interface XssSanitizeResult {
  sanitized: string;
}

const XSS_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'a', 'code', 'pre', 'br', 'p', 'ul', 'ol', 'li', 'blockquote'];
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

export function sanitizeUserContent(content: string): XssSanitizeResult {
  const sanitized = sanitizeHtml(content, {
    allowedTags: XSS_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'class', 'target'],
      code: ['class'],
      pre: ['class'],
      li: ['class'],
      p: ['class'],
      blockquote: ['class'],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    transformTags: {
      // allowedSchemes already drops these hrefs, but that leaves a bare <a>;
      // downgrading to <span> makes the neutering visible instead of silent.
      a: (originalTagName, tagAttributes) => {
        const rawHref = tagAttributes.href;
        let normalizedHref = '';
        if (rawHref !== undefined && rawHref !== null) {
          normalizedHref = rawHref.toLowerCase();
        }
        if (normalizedHref.startsWith('javascript:') || normalizedHref.startsWith('data:')) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName: originalTagName, attribs: tagAttributes };
      },
    },
  });

  return { sanitized };
}

export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: XSS_ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'class', 'target'] },
    allowedSchemes: ALLOWED_SCHEMES,
  });
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export function sanitizeContent(content: string): string {
  return sanitizeUserContent(content).sanitized;
}

const ALLOWED_FILE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
const BYTES_PER_MEGABYTE = 1024 * 1024;

export function validateFile(uploadedFile: File): FileValidationResult {
  const fileMaxBytes = FILE_LIMITS.MAX_SIZE_BYTES;

  if (uploadedFile.size > fileMaxBytes) {
    const maxSizeMb = (fileMaxBytes / BYTES_PER_MEGABYTE).toFixed(1);
    return { isValid: false, error: `File size exceeds ${maxSizeMb}MB limit.` };
  }

  if (!ALLOWED_FILE_MIME_TYPES.includes(uploadedFile.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Only Images and PDFs are allowed.',
    };
  }

  return { isValid: true };
}
