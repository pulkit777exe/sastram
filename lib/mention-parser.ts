/**
 * Parse @mentions from message content
 * Returns array of usernames mentioned and formatted content
 */
export function parseMentions(content: string): {
  usernames: string[];
  formatted: string;
} {
  const mentionRegex = /@(\w+)/g;
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
 * Find user IDs from usernames
 */
export async function resolveUserMentions(
  usernames: string[],
  prisma: { user: { findMany: (args: unknown) => Promise<{ id: string }[]> } }
): Promise<string[]> {
  if (usernames.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { in: usernames, mode: "insensitive" } },
        { email: { in: usernames.map((u) => `${u}@`), mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
    },
  });

  return users.map((u) => u.id);
}

/**
 * Format mentions for display (highlight mentioned users)
 */
export function formatMentionsForDisplay(content: string): string {
  return content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

/**
 * Extract parent message ID from reply context
 */
export function extractReplyContext(content: string): {
  parentId: string | null;
  cleanContent: string;
} {
  // Check for reply pattern: ">>messageId content"
  const replyRegex = /^>>([\w-]+)\s+/;
  const match = content.match(replyRegex);

  if (match && match[1]) {
    return {
      parentId: match[1],
      cleanContent: content.replace(replyRegex, "").trim(),
    };
  }

  return {
    parentId: null,
    cleanContent: content,
  };
}
