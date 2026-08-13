export function computeHasMore(offset: number, limit: number, total: number): boolean {
  return offset + limit < total;
}

export function clampLimit(
  input: number | undefined | null,
  { default: defaultLimit = 50, max = 100 }: { default?: number; max?: number } = {},
): number {
  return Math.min(input || defaultLimit, max);
}
