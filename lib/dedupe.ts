const cache = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
const TTL_MS = 30_000;

/**
 * Collapses concurrent identical queries into one in-flight promise.
 * Entries are removed on settle; the TTL sweep only exists to catch promises
 * that somehow never settle, so the map can't grow unbounded.
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  for (const [k, entry] of cache) {
    if (now - entry.timestamp > TTL_MS) cache.delete(k);
  }

  const existing = cache.get(key);
  if (existing) return existing.promise as Promise<T>;

  const promise = fn().finally(() => cache.delete(key));
  cache.set(key, { promise, timestamp: now });
  return promise;
}
