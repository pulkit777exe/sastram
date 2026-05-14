import sanitizeHtml from 'sanitize-html';

const BAD_WORDS = ['spam', 'scam', 'malware', 'virus', 'phishing'];

export function containsBadLanguage(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return BAD_WORDS.some((word) => lowerContent.includes(word));
}

export function filterBadLanguage(content: string): string {
  let filteredContent = content;
  BAD_WORDS.forEach((word) => {
    const regex = new RegExp(word, 'gi');
    filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
  });
  return filteredContent;
}

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

  const hadDangerousContent = dangerousPatterns.some((pattern) => pattern.test(content));

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

export function validateFile(file: File): FileValidationResult {
  const MAX_SIZE = 4.5 * 1024 * 1024; // vercel blob limit
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];

  if (file.size > MAX_SIZE) {
    return { isValid: false, error: 'File size exceeds 5MB limit.' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Only Images and PDFs are allowed.',
    };
  }

  if (file.name.toLowerCase().includes('virus')) {
    return { isValid: false, error: 'Malware detected.' };
  }

  return { isValid: true };
}
