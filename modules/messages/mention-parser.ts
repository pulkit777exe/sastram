// EMAIL_RE matches the email part after @, e.g. user@example.com
const EMAIL_RE = /[\w.-]+@[\w.-]+\.\w+/;
// HANDLE_RE matches a plain username handle, e.g. john_doe
const HANDLE_RE = /[\w.-]+/;
// Combined: @<email|handle> — email alternative comes first so `@a@b.com` matches whole address
// rather than stopping at bare `@a`. Tests: add coverage for email vs handle parsing.
const MENTION_REGEX = new RegExp(`@(${EMAIL_RE.source}|${HANDLE_RE.source})`, 'g');

export function parseMentions(content: string): {
  usernames: string[];
  formatted: string;
} {
  const usernames: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(MENTION_REGEX)) {
    const username = match[1];
    if (!username) {
      continue;
    }
    if (seen.has(username)) {
      continue;
    }
    seen.add(username);
    usernames.push(username);
  }

  return {
    usernames,
    formatted: content,
  };
}

export async function resolveUserMentions(
  usernames: string[],
  prisma: { user: { findMany: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }[]> } }
): Promise<string[]> {
  if (usernames.length === 0) {
    return [];
  }

  const emails: string[] = [];
  const names: string[] = [];
  for (const username of usernames) {
    if (username.includes('@')) {
      emails.push(username);
    } else {
      names.push(username);
    }
  }

  const orConditions: Array<Record<string, unknown>> = [];
  if (names.length > 0) {
    orConditions.push({ name: { in: names, mode: 'insensitive' } });
  }
  if (emails.length > 0) {
    orConditions.push({ email: { in: emails, mode: 'insensitive' } });
  }

  if (orConditions.length === 0) {
    return [];
  }

  const where = {
    AND: [{ deletedAt: null }],
    OR: orConditions,
  };

  const users = await prisma.user.findMany({ where, select: { id: true } });

  const ids: string[] = [];
  for (const user of users) {
    ids.push(user.id);
  }
  return ids;
}

