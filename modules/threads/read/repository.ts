import { prisma } from '@/lib/infrastructure/prisma';
import { Role, type Prisma, type ThreadVisibility } from '@prisma/client';
import { cache } from 'react';
import { canAccessThread } from '@/modules/threads/access';

export type ThreadMessageReactionAggregate = {
  type: string;
  _count: number;
};

export type ThreadMessage = {
  id: string;
  content: string;
  threadId: string;
  senderId: string | null;
  parentId: string | null;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
  isEdited: boolean;
  isPinned: boolean;
  isAI: boolean;
  deletedAt: Date | null;
  likeCount: number;
  replyCount: number;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  reactions: ThreadMessageReactionAggregate[];
  _count: {
    replies: number;
  };
  attachments?: Array<{
    id: string;
    url: string;
    type: string;
    name: string | null;
    size: number | null;
  }>;
  poll?: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
    createdAt: Date;
    votes?: Array<{
      id: string;
      pollId: string;
      userId: string;
      optionIndex: number;
      createdAt: Date;
    }>;
  } | null;
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

type ThreadPoll = {
  id: string;
  question: string;
  options: string[];
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
} | null;

export type ThreadWithFullContext = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdBy: string | null;
  visibility: string;
  aiSummary: string | null;
  resolutionScore: number | null;
  isOutdated: boolean;
  threadDna: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  lastVerifiedAt: Date | null;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  tags: ThreadTag[];
  aiSearchSession: ThreadAiSearchSession;
  poll: ThreadPoll;
  _count: {
    messages: number;
  };
  isBookmarked: boolean;
  isSubscribed: boolean;
};

type ThreadRow = Omit<
  ThreadWithFullContext,
  'tags' | '_count' | 'isBookmarked' | 'isSubscribed'
> & {
  tags: ThreadTag[] | null;
  message_count: number | null;
  is_bookmarked: boolean | null;
  is_subscribed: boolean | null;
};

export type ThreadParticipant = {
  id: string;
  name: string | null;
  image: string | null;
  messageCount: number;
};

export type PaginatedMessagesResult = {
  messages: ThreadMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
};

export async function getThreadParticipants(
  threadId: string,
  limit: number = 12
): Promise<ThreadParticipant[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string | null;
    image: string | null;
    message_count: bigint;
  }>>`
    SELECT
      u.id,
      u.name,
      u.image,
      COUNT(m.id)::bigint AS message_count
    FROM "messages" m
    JOIN "users" u ON u.id = m."senderId"
    WHERE m."threadId" = ${threadId}
      AND m."deletedAt" IS NULL
      AND m."senderId" IS NOT NULL
    GROUP BY u.id, u.name, u.image
    ORDER BY MIN(m."createdAt") ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.image,
    messageCount: Number(r.message_count),
  }));
}

export async function getThreadMessagesPaginated(
  threadId: string,
  cursor?: string | null,
  limit: number = 50
): Promise<PaginatedMessagesResult> {
  const where: Prisma.MessageWhereInput = { threadId, deletedAt: null };

  if (cursor) {
    const cursorMessage = await prisma.message.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    });
    if (cursorMessage) {
      where.createdAt = { lt: cursorMessage.createdAt };
    }
  }

  const [messages, thread] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, image: true } },
        attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
        poll: { include: { votes: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    }),
    prisma.thread.findUnique({
      where: { id: threadId },
      select: { messageCount: true },
    }),
  ]);

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  const messageIds = page.map((m) => m.id);
  const reactionsByMessage = new Map<string, ThreadMessageReactionAggregate[]>();
  if (messageIds.length > 0) {
    const reactionRows = await prisma.reaction.groupBy({
      by: ['messageId', 'emoji'],
      where: { messageId: { in: messageIds } },
      _count: { _all: true },
    });
    for (const r of reactionRows) {
      const list = reactionsByMessage.get(r.messageId) ?? [];
      list.push({ type: r.emoji, _count: r._count._all });
      reactionsByMessage.set(r.messageId, list);
    }
  }

  return {
    messages: page.map((m) => ({
      id: m.id,
      content: m.content,
      threadId: m.threadId,
      senderId: m.senderId,
      parentId: m.parentId,
      depth: m.depth,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      isEdited: m.isEdited,
      isPinned: m.isPinned,
      isAI: m.isAiResponse,
      deletedAt: m.deletedAt,
      likeCount: m.likeCount,
      replyCount: m.replyCount,
      author: m.sender ?? { id: '', name: null, image: null },
      reactions: reactionsByMessage.get(m.id) ?? [],
      _count: { replies: m.replyCount },
      attachments: m.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        type: a.type,
        name: a.name,
        size: a.size !== null ? Number(a.size) : null,
      })),
      poll: m.poll
        ? {
            id: m.poll.id,
            question: m.poll.question,
            options: m.poll.options as string[],
            isActive: m.poll.isActive,
            expiresAt: m.poll.expiresAt,
            createdAt: m.poll.createdAt,
            votes: m.poll.votes,
          }
        : null,
    })),
    hasMore,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    totalCount: thread?.messageCount ?? 0,
  };
}

export const getThreadWithFullContext = cache(
  async (slug: string, userId?: string): Promise<ThreadWithFullContext | null> => {
    const uid = userId ?? '';
    const rows = await prisma.$queryRaw<ThreadRow[]>`
      SELECT
        s.id,
        s.name,
        s.slug,
        s.description as description,
        s."createdBy" as "createdBy",
        s."visibility" as "visibility",
        s."aiSummary" as "aiSummary",
        s."resolutionScore" as "resolutionScore",
        s."isOutdated" as "isOutdated",
        s."threadDna" as "threadDna",
        s."createdAt" as "createdAt",
        s."updatedAt" as "updatedAt",
        s."lastVerifiedAt" as "lastVerifiedAt",
        json_build_object(
          'id', u.id,
          'name', u.name,
          'image', u.image
        ) as author,
        COALESCE(tags.tags, '[]'::json) as tags,
        COALESCE(poll.poll, 'null'::json) as poll,
        COALESCE(counts.message_count, 0) as message_count,
        EXISTS (
          SELECT 1 FROM "user_bookmarks" b
          WHERE b."threadId" = s.id AND b."userId" = ${uid}
        ) as is_bookmarked,
        EXISTS (
          SELECT 1 FROM "thread_subscriptions" ts
          WHERE ts."threadId" = s.id AND ts."userId" = ${uid} AND ts."isActive" = true
        ) as is_subscribed
      FROM "threads" s
      JOIN "users" u ON u.id = s."createdBy"
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object('tag', json_build_object('name', tt.name))
        ) as tags
        FROM "thread_tag_relations" ttr
        JOIN "thread_tags" tt ON tt.id = ttr."tagId"
        WHERE ttr."threadId" = s.id
      ) tags ON true
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'id', p.id,
          'question', p.question,
          'options', p.options,
          'isActive', p."isActive",
          'expiresAt', p."expiresAt",
          'createdAt', p."createdAt"
        ) as poll
        FROM "polls" p
        WHERE p."threadId" = s.id AND p."messageId" IS NULL
      ) poll ON true
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COUNT(*)::int FROM "messages" m2 WHERE m2."threadId" = s.id AND m2."deletedAt" IS NULL) as message_count
      ) counts ON true
      WHERE s.slug = ${slug}
        AND s."deletedAt" IS NULL
      LIMIT 1
    `;


    const row = rows[0];
    if (!row) return null;

    if (row.visibility !== 'PUBLIC') {
      if (!userId) return null;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      const allowed = await canAccessThread(
        { threadId: row.id, createdBy: row.createdBy, visibility: row.visibility as ThreadVisibility },
        userId,
        user?.role ?? Role.USER
      );
      if (!allowed) return null;
    }

    const { message_count, is_bookmarked, is_subscribed, tags, ...thread } = row;

    return {
      ...thread,
      tags: tags ?? [],
      aiSearchSession: null,
      _count: { messages: message_count ?? 0 },
      isBookmarked: is_bookmarked ?? false,
      isSubscribed: is_subscribed ?? false,
    };
  }
);