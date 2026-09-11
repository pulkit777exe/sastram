// Shared in-memory cache for collections dropdown — 30s stale, Hobby-friendly
// KISS: module-level singleton, no external dep, invalidated on create
let cached: { data: { id: string; title: string }[] | null; ts: number } = { data: null, ts: 0 };
const TTL_MS = 30_000;

export function getCollectionsCache(): { id: string; title: string }[] | null {
  if (cached.data && Date.now() - cached.ts < TTL_MS) return cached.data;
  return null;
}

export function setCollectionsCache(data: { id: string; title: string }[]) {
  cached = { data, ts: Date.now() };
}

export function invalidateCollectionsCache() {
  cached.ts = 0;
}
