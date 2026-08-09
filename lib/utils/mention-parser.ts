// Email alternative comes first so `@a@b.com` matches the whole address
// rather than stopping at the bare `@a`.
const MENTION_REGEX = /@([\w.-]+@[\w.-]+\.\w+|[\w.-]+)/g;

export function parseMentions(content: string): {
  usernames: string[];
  formatted: string;
} {
  const usernames = Array.from(content.matchAll(MENTION_REGEX), (m) => m[1]).filter(Boolean);

  return {
    usernames: Array.from(new Set(usernames)),
    formatted: content,
  };
}

export async function resolveUserMentions(
  usernames: string[],
  prisma: { user: { findMany: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }[]> } }
): Promise<string[]> {
  if (usernames.length === 0) return [];

  const emails = usernames.filter((u) => u.includes('@'));
  const names = usernames.filter((u) => !u.includes('@'));

  const where: { AND: Array<Record<string, unknown>>; OR: Array<Record<string, unknown>> } = {
    AND: [{ deletedAt: null }],
    OR: [],
  };

  if (names.length > 0) {
    where.OR.push({ name: { in: names, mode: 'insensitive' } });
  }

  if (emails.length > 0) {
    where.OR.push({ email: { in: emails, mode: 'insensitive' } });
  }

  if (where.OR.length === 0) return [];

  const users = await prisma.user.findMany({ where, select: { id: true } });

  return users.map((u) => u.id);
}

