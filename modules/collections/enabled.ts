import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';

const enabledCache = new Map<string, { v: boolean; ts: number }>();
const TTL_MS = 60_000;

/**
 * Hobby-safe gate: collections is opt-out, never opt-in.
 * Returns true unless the user explicitly set collectionsEnabled === false.
 * Cached 60s per user to avoid Prisma round-trip on every hover Save.
 */
export async function isCollectionsEnabled(userId: string): Promise<boolean> {
  const hit = enabledCache.get(userId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.v;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const prefs = parseUserPreferences((user?.preferences as unknown) ?? {});
    const v = (prefs as unknown as { collectionsEnabled?: boolean }).collectionsEnabled !== false;
    enabledCache.set(userId, { v, ts: Date.now() });
    return v;
  } catch {
    return true;
  }
}

export function invalidateCollectionsEnabledCache(userId: string) {
  enabledCache.delete(userId);
}