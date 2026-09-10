import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';

/**
 * Hobby-safe gate: collections is opt-out, never opt-in.
 * Returns true unless the user explicitly set collectionsEnabled === false.
 */
export async function isCollectionsEnabled(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const prefs = parseUserPreferences((user?.preferences as unknown) ?? {});
    return (prefs as unknown as { collectionsEnabled?: boolean }).collectionsEnabled !== false;
  } catch {
    return true;
  }
}