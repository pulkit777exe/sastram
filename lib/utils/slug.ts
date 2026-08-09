import { randomUUID } from 'crypto';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Suffix keeps slugs unique when two threads share a title. */
export function buildThreadSlug(title: string, existingId?: string): string {
  return `${slugify(title)}-${existingId ?? randomUUID()}`;
}

