import { randomUUID } from 'crypto';

/**
 * Convert a string to a URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a thread slug with optional existing ID for uniqueness
 */
export function buildThreadSlug(title: string, existingId?: string): string {
  const base = slugify(title);
  const suffix = existingId ?? randomUUID();
  return `${base}-${suffix}`;
}

/**
 * Build a community slug
 */
export function buildCommunitySlug(title: string): string {
  const base = slugify(title);
  const suffix = randomUUID();
  return `${base}-${suffix}`;
}
