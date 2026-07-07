import sanitizeHtml from 'sanitize-html';

export interface XssSanitizeResult {
  sanitized: string;
  hadDangerousContent: boolean;
}

const XSS_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'a', 'code', 'pre', 'br', 'p', 'ul', 'ol', 'li', 'blockquote'];
const XSS_ALLOWED_ATTR = ['href', 'class'];

export function sanitizeUserContent(content: string): XssSanitizeResult {
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<svg[^>]*on/gi,
    /data:/gi,
  ];

  const hadDangerousContent = dangerousPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });

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
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.href && attribs.href.toLowerCase().startsWith('javascript:')) {
          return { tagName: 'span', attribs: {} };
        }
        if (attribs.href && attribs.href.toLowerCase().startsWith('data:')) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName, attribs };
      },
    },
  });

  return { sanitized, hadDangerousContent };
}

export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: XSS_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'class', 'target'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

import { FILE_LIMITS } from '@/lib/config/constants';

export function filterBadLanguage(content: string): string {
  return sanitizeUserContent(content).sanitized;
}

export function validateFile(file: File): FileValidationResult {
  const MAX_SIZE = FILE_LIMITS.MAX_SIZE_BYTES;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];

  if (file.size > MAX_SIZE) {
    return { isValid: false, error: 'File size exceeds 4.5MB limit.' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Only Images and PDFs are allowed.',
    };
  }

  return { isValid: true };
}
