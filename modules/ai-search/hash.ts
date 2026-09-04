import crypto from 'crypto';

export function normalizeQuery(query: string): string {
  const lower = query.toLowerCase();
  const trimmed = lower.trim();
  const withoutPunctuation = trimmed.replace(/[^\w\s]/g, '');
  const normalizedSpaces = withoutPunctuation.replace(/\s+/g, ' ');
  return normalizedSpaces;
}

export function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(normalizeQuery(query)).digest('hex');
}
