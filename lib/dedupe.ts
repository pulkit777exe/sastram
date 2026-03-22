const cache = new Map<string, Promise<any>>();

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return cache.get(key)!;
  const p = fn().finally(() => cache.delete(key));
  cache.set(key, p);
  return p;
}
