import crypto from 'crypto';

export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(normalizeQuery(query)).digest('hex');
}
