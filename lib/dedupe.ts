const cache = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
const TTL_MS = 30_000; // 30 seconds

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > TTL_MS) {
      cache.delete(key);
    }
  }
}

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  evictExpired();

  const existing = cache.get(key);
  if (existing) return existing.promise as Promise<T>;

  const p = fn().finally(() => cache.delete(key));
  cache.set(key, { promise: p, timestamp: Date.now() });
  return p;
}
