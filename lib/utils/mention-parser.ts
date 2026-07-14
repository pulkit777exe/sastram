/**
 * Parse @mentions from message content
 * Returns array of usernames mentioned and formatted content
 * Supports both @username and @email formats
 */
export function parseMentions(content: string): {
  usernames: string[];
  formatted: string;
} {
  // Match @username or @email patterns
  const mentionRegex = /@([\w.-]+@[\w.-]+\.\w+|[\w.-]+)/g;
  const matches = content.matchAll(mentionRegex);
  const usernames: string[] = [];

  for (const match of matches) {
    if (match[1]) {
      usernames.push(match[1]);
    }
  }

  // Remove duplicates
  const uniqueUsernames = Array.from(new Set(usernames));

  return {
    usernames: uniqueUsernames,
    formatted: content,
  };
}

/**
 * Find user IDs from usernames or emails
 */
export async function resolveUserMentions(
  usernames: string[],
  prisma: { user: { findMany: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }[]> } }
): Promise<string[]> {
  if (usernames.length === 0) return [];

  // Separate emails from usernames
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

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
    },
  });

  return users.map((u) => u.id);
}


