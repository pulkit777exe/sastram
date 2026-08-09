export function computeHasMore(offset: number, limit: number, total: number): boolean {
  return offset + limit < total;
}
