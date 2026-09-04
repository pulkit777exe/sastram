const DEFAULT_LIMIT = 50; // fallback when caller passes undefined/null/0
const MAX_LIMIT = 100; // hard ceiling to prevent unbounded scans

export function computeHasMore(offset: number, limit: number, total: number): boolean {
  return offset + limit < total;
}

export function clampLimit(
  requestedLimit: number | undefined | null,
  { default: defaultLimit = DEFAULT_LIMIT, max = MAX_LIMIT }: { default?: number; max?: number } = {},
): number {
  let effectiveLimit: number;
  if (requestedLimit === undefined || requestedLimit === null || requestedLimit === 0) {
    effectiveLimit = defaultLimit;
  } else {
    effectiveLimit = requestedLimit;
  }
  return Math.min(effectiveLimit, max);
}
