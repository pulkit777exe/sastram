import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';

const enabledCache = new Map<string, { v: boolean; ts: number }>();
const TTL_MS = 60_000;

/**
 * Collections is always enabled (Phase 7). Legacy stored `collectionsEnabled: false`
 * is ignored safely; parsing remains backward-compatible for old preference blobs.
 * Cached 60s per user to avoid Prisma round-trip on every hover Save.
 */
export async function isCollectionsEnabled(userId: string): Promise<boolean> {
  const hit = enabledCache.get(userId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.v;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    parseUserPreferences((user?.preferences as unknown) ?? {});
    enabledCache.set(userId, { v: true, ts: Date.now() });
    return true;
  } catch {
    return true;
  }
}

export function invalidateCollectionsEnabledCache(userId: string) {
  enabledCache.delete(userId);
}