import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

export async function refreshUserExpertise(userId: string): Promise<void> {
  const [threads, sessions] = await Promise.all([
    prisma.thread.findMany({
      where: { createdBy: userId },
      select: { threadDna: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.aiSearchSession.findMany({
      where: { userId, queryType: { not: null } },
      select: { queryType: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const counts = new Map<string, number>();
  for (const t of threads) {
    const dna = (t.threadDna as unknown as { expertiseLevel?: string }) ?? {};
    if (dna.expertiseLevel && LEVELS.includes(dna.expertiseLevel as never)) {
      counts.set(dna.expertiseLevel, (counts.get(dna.expertiseLevel) ?? 0) + 2);
    }
  }
  for (const s of sessions) {
    if (s.queryType && LEVELS.includes(s.queryType as never)) {
      counts.set(s.queryType, (counts.get(s.queryType) ?? 0) + 1);
    } else if (s.queryType === 'technical') counts.set('advanced', (counts.get('advanced') ?? 0) + 1);
  }

  let top: string | null = null;
  let max = 0;
  for (const [k, v] of counts) {
    if (v > max) {
      max = v;
      top = k;
    }
  }
  if (!top) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = parseUserPreferences(user?.preferences);
  if (prefs.expertiseLevel === top) return;

  await prisma.user.update({
    where: { id: userId },
    data: { preferences: { ...prefs, expertiseLevel: top } },
  });
}
