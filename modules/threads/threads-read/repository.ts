import { prisma } from '@/lib/infrastructure/prisma';
import { Role, type Prisma } from '@prisma/client';
import { dedupe } from '@/lib/dedupe';
import { canAccessThread } from '@/lib/thread-access';

export type ThreadMessageReactionAggregate = {
  type: string;
  _count: number;
};

export type ThreadMessage = {
  id: string;
  body: string;
  threadId: string;
  senderId: string | null;
  parentId: string | null;
  depth: number;
  createdAt: Date;
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
  messages: ThreadMessage[];
  tags: ThreadTag[];
  aiSearchSession: ThreadAiSearchSession;
  poll: ThreadPoll;
  _count: {
    messages: number;
  };
  isBookmarked: boolean;
  isSubscribed: boolean;
};

type ThreadRow = {
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
  tags: ThreadTag[] | null;
  messages: ThreadMessage[] | null;
  poll: ThreadPoll | null;
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
  const where: Record<string, unknown> = {
    threadId,
    deletedAt: null,
  };

  if (cursor) {
    const cursorMessage = await prisma.message.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    });
    if (cursorMessage) {
      (where as Record<string, unknown>).createdAt = { gt: cursorMessage.createdAt };
    }
  }

  const [messages, totalCount] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, image: true } },
        reactions: { select: { emoji: true } },
        attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
        poll: {
          include: {
            votes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    }),
    prisma.message.count({ where: { threadId, deletedAt: null } }),
  ]);

  const hasMore = messages.length > limit;
  const sliced = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null;

  return {
    messages: sliced.map((m) => ({
      id: m.id,
      body: m.content,
      threadId: m.threadId,
      senderId: m.senderId,
      parentId: m.parentId,
      depth: m.depth,
      createdAt: m.createdAt,
      isEdited: m.isEdited,
      isPinned: m.isPinned,
      isAI: m.isAiResponse,
      deletedAt: m.deletedAt,
      likeCount: m.likeCount,
      replyCount: m.replyCount,
      author: m.sender ?? { id: '', name: null, image: null },
      reactions: [],
      _count: { replies: m.replyCount },
      attachments: m.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        type: a.type,
        name: a.name,
        size: a.size !== null ? Number(a.size) : null,
      })),
      poll: m.poll ? {
        id: m.poll.id,
        question: m.poll.question,
        options: m.poll.options as string[],
        isActive: m.poll.isActive,
        expiresAt: m.poll.expiresAt,
        createdAt: m.poll.createdAt,
        votes: m.poll.votes.map((v) => ({
          id: v.id,
          pollId: v.pollId,
          userId: v.userId,
          optionIndex: v.optionIndex,
          createdAt: v.createdAt,
        })),
      } : null,
    })),
    hasMore,
    nextCursor,
    totalCount,
  };
}

export async function getThreadWithFullContext(
  slug: string,
  userId?: string
): Promise<ThreadWithFullContext | null> {
  const uid = userId ?? '';
  return dedupe(`threads:full:${slug}:${uid}`, async () => {
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
        COALESCE(msgs.messages, '[]'::json) as messages,
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
        SELECT json_agg(mrow.message ORDER BY mrow.created_at) as messages
        FROM (
          SELECT
            m."createdAt" as created_at,
            json_build_object(
              'id', m.id,
              'body', m.content,
              'threadId', m."threadId",
              'senderId', m."senderId",
              'parentId', m."parentId",
              'depth', m.depth,
              'createdAt', m."createdAt",
              'isEdited', m."isEdited",
              'isPinned', m."isPinned",
              'isAI', m."isAiResponse",
              'deletedAt', m."deletedAt",
              'likeCount', m."likeCount",
              'replyCount', m."replyCount",
              'author', json_build_object('id', su.id, 'name', su.name, 'image', su.image),
              'reactions', COALESCE(r.reactions, '[]'::json),
              'attachments', COALESCE(a.attachments, '[]'::json),
              'poll', p.poll,
              '_count', json_build_object('replies', m."replyCount")
            ) as message
          FROM "messages" m
          JOIN "users" su ON su.id = m."senderId"
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object('type', rc.emoji, '_count', rc.count)
            ) as reactions
            FROM (
              SELECT emoji, COUNT(*)::int as count
              FROM "reactions"
              WHERE "messageId" = m.id
              GROUP BY emoji
            ) rc
          ) r ON true
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object('id', a.id, 'url', a.url, 'type', a.type, 'name', a.name, 'size', a.size)
            ) as attachments
            FROM "attachments" a
            WHERE a."messageId" = m.id
          ) a ON true
          LEFT JOIN LATERAL (
            SELECT json_build_object(
              'id', p.id,
              'question', p.question,
              'options', p.options,
              'isActive', p."isActive",
              'expiresAt', p."expiresAt",
              'createdAt', p."createdAt",
              'votes', COALESCE(pv.votes, '[]'::json)
            ) as poll
            FROM "polls" p
            LEFT JOIN LATERAL (
              SELECT json_agg(
                json_build_object(
                  'id', v.id,
                  'pollId', v."pollId",
                  'userId', v."userId",
                  'optionIndex', v."optionIndex",
                  'createdAt', v."createdAt"
                )
              ) as votes
              FROM "poll_votes" v
              WHERE v."pollId" = p.id
            ) pv ON true
            WHERE p."messageId" = m.id
          ) p ON true
          WHERE m."threadId" = s.id
        ) mrow
      ) msgs ON true
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
        { threadId: row.id, createdBy: row.createdBy, visibility: row.visibility as never },
        userId,
        user?.role ?? Role.USER
      );
      if (!allowed) return null;
    }

    const aiSearchSession: ThreadAiSearchSession = null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? null,
      createdBy: row.createdBy,
      visibility: row.visibility,
      aiSummary: row.aiSummary ?? null,
      resolutionScore: row.resolutionScore ?? null,
      isOutdated: row.isOutdated,
      threadDna: row.threadDna ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastVerifiedAt: row.lastVerifiedAt ?? null,
      author: row.author,
      messages: (row.messages ?? []) as ThreadMessage[],
      tags: (row.tags ?? []) as ThreadTag[],
      aiSearchSession,
      poll: (row.poll ?? null) as ThreadPoll,
      _count: {
        messages: row.message_count ?? 0,
      },
      isBookmarked: row.is_bookmarked ?? false,
      isSubscribed: row.is_subscribed ?? false,
    };
  });
}
