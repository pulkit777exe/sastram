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
      a: (tagName, attribs) => {
        const href = attribs.href?.toLowerCase() ?? '';
        if (href.startsWith('javascript:') || href.startsWith('data:')) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName, attribs };
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

const VALIDATE_FILE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];

export function validateFile(file: File): FileValidationResult {
  const MAX_SIZE = FILE_LIMITS.MAX_SIZE_BYTES;

  if (file.size > MAX_SIZE) {
    const maxSizeMB = (MAX_SIZE / (1024 * 1024)).toFixed(1);
    return { isValid: false, error: `File size exceeds ${maxSizeMB}MB limit.` };
  }

  if (!VALIDATE_FILE_ALLOWED_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Only Images and PDFs are allowed.',
    };
  }

  return { isValid: true };
}
