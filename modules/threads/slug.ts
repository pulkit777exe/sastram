import { randomUUID } from 'crypto';
import { slugify } from '@/lib/utils/slug';

/** Suffix keeps slugs unique when two threads share a title. */
export function buildThreadSlug(title: string, existingId?: string): string {
  return `${slugify(title)}-${existingId ?? randomUUID()}`;
}
