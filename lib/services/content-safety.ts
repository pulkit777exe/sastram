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

// Hostname-prefix policy for IPv4 literals. Kept as a prefix test on purpose:
// `127.0.0.1.evil.com` is treated as unsafe (see the over-block test).
const PRIVATE_IPV4_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.|0\.)/;

const IPV6_GROUP_COUNT = 8;
const IPV6_BYTE_COUNT = 16;
const IPV4_MAPPED_MARKER_OFFSET = 10;
const IPV4_EMBEDDED_OFFSET = IPV4_MAPPED_MARKER_OFFSET + 2;

/**
 * WHATWG `URL.hostname` returns IPv6 literals wrapped in brackets, e.g. `[::1]`,
 * so the previous string-prefix checks could never match them. Parse the
 * already-normalized literal (lowercase, compressed, `::ffff:7f00:1` form) into
 * its 16 bytes instead.
 */
function parseIpv6Host(host: string): number[] | null {
  if (!host.startsWith('[') || !host.endsWith(']')) return null;
  const address = host.slice(1, -1);
  const compressionIndex = address.indexOf('::');
  const hasCompression = compressionIndex !== -1;
  const headPart = hasCompression ? address.slice(0, compressionIndex) : address;
  const tailPart = hasCompression ? address.slice(compressionIndex + 2) : '';
  if (hasCompression && tailPart.includes('::')) return null;

  const headGroups = headPart.length > 0 ? headPart.split(':') : [];
  const tailGroups = tailPart.length > 0 ? tailPart.split(':') : [];
  const explicitGroups = headGroups.length + tailGroups.length;
  if (hasCompression ? explicitGroups >= IPV6_GROUP_COUNT : explicitGroups !== IPV6_GROUP_COUNT) {
    return null;
  }

  const groups = [...headGroups];
  while (groups.length < IPV6_GROUP_COUNT - tailGroups.length) groups.push('0');
  groups.push(...tailGroups);

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }

  return bytes.length === IPV6_BYTE_COUNT ? bytes : null;
}

function isBlockedIpv6(bytes: number[]): boolean {
  const lastByte = bytes[IPV6_BYTE_COUNT - 1]!;
  // Unspecified `::` and loopback `::1`.
  if (bytes.slice(0, IPV6_BYTE_COUNT - 1).every((byte) => byte === 0)) {
    if (lastByte === 0 || lastByte === 1) return true;
  }
  // Multicast ff00::/8.
  if (bytes[0] === 0xff) return true;
  // Unique local fc00::/7.
  if ((bytes[0]! & 0xfe) === 0xfc) return true;
  // Link-local fe80::/10.
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true;
  // IPv4-mapped `::ffff:0:0/96` and the deprecated IPv4-compatible `::/96`:
  // run the embedded IPv4 through the IPv4 policy.
  const prefixIsZero = bytes.slice(0, IPV4_MAPPED_MARKER_OFFSET).every((byte) => byte === 0);
  const marker = bytes[IPV4_MAPPED_MARKER_OFFSET]! * 0x100 + bytes[IPV4_MAPPED_MARKER_OFFSET + 1]!;
  const isMapped = marker === 0xffff;
  const isCompatible = marker === 0;
  if (prefixIsZero && (isMapped || isCompatible)) {
    const embedded = `${bytes[IPV4_EMBEDDED_OFFSET]}.${bytes[IPV4_EMBEDDED_OFFSET + 1]}.${bytes[IPV4_EMBEDDED_OFFSET + 2]}.${bytes[IPV4_EMBEDDED_OFFSET + 3]}`;
    return PRIVATE_IPV4_RE.test(embedded);
  }
  return false;
}

const SUSPICIOUS_SUFFIX_RE = /\.(nip\.io|xip\.io|sslip\.io|trycloudflare\.com)$/i;

export function isSafePublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host.startsWith('[')) {
      const ipv6Bytes = parseIpv6Host(host);
      if (ipv6Bytes === null || isBlockedIpv6(ipv6Bytes)) return false;
      return true;
    }
    if (PRIVATE_IPV4_RE.test(host)) return false;
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (host === 'metadata.google.internal' || host === 'metadata.google' || host.endsWith('.internal')) return false;
    if (SUSPICIOUS_SUFFIX_RE.test(host)) return false;
    // Block single-value IP encodings (decimal, hex, octal) that bypass string checks
    if (/^\d+$/.test(host)) return false;
    if (/^0x[0-9a-f]+$/i.test(host)) return false;
    if (/^0[0-7]+$/.test(host)) return false;
    if (/^0x[0-9a-f]+\.0x[0-9a-f]+/i.test(host) || /^0[0-7]+\.[0-9.]+/.test(host)) return false;
    // Block 0x7f.0.0.1 style and 2130706433 decimal already covered; also check dotted hex/octal
    if (/^(0x[0-9a-f]+\.)+0x[0-9a-f]+$/i.test(host)) return false;
    if (/^(0[0-7]+\.)+0*[0-7]+$/.test(host) && host.includes('.')) {
      // Dotted octal like 0177.0.0.1 — already partially covered but keep explicit
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
