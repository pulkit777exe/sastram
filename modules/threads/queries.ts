import { prisma } from "@/lib/infrastructure/prisma";
import type { Prisma } from "@prisma/client";

export type ThreadMessageReactionAggregate = {
  type: string;
  _count: number;
};

export type ThreadMessage = {
  id: string;
  body: string;
  parentId: string | null;
  depth: number;
  createdAt: Date;
  isPinned: boolean;
  isAI: boolean;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  reactions: ThreadMessageReactionAggregate[];
  _count: {
    replies: number;
  };
};

type ThreadTag = {
  tag: {
    name: string;
  };
};

type ThreadAiSource = {
  source: string;
  url: string | null;
  confidence: number;
  snippet: string | null;
};

type ThreadAiSearchSession = {
  lastUpdated: Date;
  results: ThreadAiSource[];
} | null;

type ThreadMember = {
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  role: string;
};

export type ThreadWithFullContext = {
  id: string;
  title: string;
  slug: string;
  coverImage: string | null;
  aiSummary: string | null;
  resolutionScore: number | null;
  isOutdated: boolean;
  threadDna: Prisma.JsonValue | null;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  messages: ThreadMessage[];
  tags: ThreadTag[];
  aiSearchSession: ThreadAiSearchSession;
  members: ThreadMember[];
  _count: {
    messages: number;
    members: number;
  };
  bookmarks: { userId: string }[];
  subscriptions: { userId: string }[];
};

export async function getThreadWithFullContext(
  slug: string,
  userId: string,
): Promise<ThreadWithFullContext | null> {
  const section = await prisma.section.findFirst({
    where: {
      slug,
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      messages: {
        where: {
          deletedAt: null,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          reactions: {
            select: {
              emoji: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
      bookmarks: {
        where: {
          userId,
        },
        select: {
          userId: true,
        },
      },
      subscriptions: {
        where: {
          userId,
        },
        select: {
          userId: true,
        },
      },
      _count: {
        select: {
          messages: {
            where: {
              deletedAt: null,
            },
          },
          members: true,
        },
      },
    },
  });

  if (!section) {
    return null;
  }

  const messages: ThreadMessage[] = section.messages.map((message) => {
    const reactionCountByEmoji = new Map<string, number>();

    for (const reaction of message.reactions) {
      const key = reaction.emoji;
      reactionCountByEmoji.set(key, (reactionCountByEmoji.get(key) ?? 0) + 1);
    }

    const reactions: ThreadMessageReactionAggregate[] = Array.from(
      reactionCountByEmoji.entries(),
    ).map(([type, count]) => ({
      type,
      _count: count,
    }));

    return {
      id: message.id,
      body: message.content,
      parentId: message.parentId ?? null,
      depth: message.depth ?? 0,
      createdAt: message.createdAt,
      isPinned: message.isPinned ?? false,
      isAI: message.isAiResponse ?? false,
      author: {
        id: message.sender.id,
        name: message.sender.name,
        image: message.sender.image,
      },
      reactions,
      _count: {
        replies: message.replyCount ?? 0,
      },
    };
  });

  // TODO: Link threads to AI search sessions in schema.
  const aiSearchSession: ThreadAiSearchSession = null;

  return {
    id: section.id,
    title: section.name,
    slug: section.slug,
    coverImage: null,
    aiSummary: section.aiSummary ?? null,
    resolutionScore: section.resolutionScore ?? null,
    isOutdated: section.isOutdated,
    threadDna: section.threadDna,
    createdAt: section.createdAt,
    author: {
      id: section.creator.id,
      name: section.creator.name,
      image: section.creator.image,
    },
    messages,
    tags: section.tags.map((t) => ({ tag: { name: t.tag.name } })),
    aiSearchSession,
    members: section.members.map((member) => ({
      user: {
        id: member.user.id,
        name: member.user.name,
        image: member.user.image,
      },
      role: member.role,
    })),
    _count: {
      messages: section._count.messages,
      members: section._count.members,
    },
    bookmarks: section.bookmarks.map((b) => ({ userId: b.userId })),
    subscriptions: section.subscriptions.map((s) => ({ userId: s.userId })),
  };
}

