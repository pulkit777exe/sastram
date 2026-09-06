import { prisma } from '@/lib/infrastructure/prisma';
import { Role, type Prisma, type ThreadVisibility } from '@prisma/client';
import { cache } from 'react';
import { canAccessThread } from '@/lib/thread-access';

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
  visibility: ThreadVisibility;
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
  } | null;
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

const IS_NOT_DELETED: Prisma.MessageWhereInput = { deletedAt: null };

function resolveAuthor(
  sender: { id: string; name: string | null; image: string | null } | null,
  fallbackSenderId: string | null
) {
  if (sender) return sender;
  return { id: fallbackSenderId ?? '', name: null, image: null };
}

function toNumberOrNull(value: bigint | number | null): number | null {
  if (value === null) return null;
  return Number(value);
}

function mapPoll(
  poll: {
    id: string;
    question: string;
    options: Prisma.JsonValue;
    isActive: boolean;
    expiresAt: Date | null;
    createdAt: Date;
    votes: Array<{ id: string; pollId: string; userId: string; optionIndex: number; createdAt: Date }>;
  } | null
): ThreadMessage['poll'] {
  if (!poll) return null;
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options as string[],
    isActive: poll.isActive,
    expiresAt: poll.expiresAt,
    createdAt: poll.createdAt,
    votes: poll.votes,
  };
}

function mapDbMessageToThreadMessage(
  m: {
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
    isAiResponse: boolean;
    deletedAt: Date | null;
    likeCount: number;
    replyCount: number;
    sender: { id: string; name: string | null; image: string | null } | null;
    attachments: Array<{ id: string; url: string; type: string; name: string | null; size: bigint | null }>;
    poll: {
      id: string;
      question: string;
      options: Prisma.JsonValue;
      isActive: boolean;
      expiresAt: Date | null;
      createdAt: Date;
      votes: Array<{ id: string; pollId: string; userId: string; optionIndex: number; createdAt: Date }>;
    } | null;
  },
  reactionsByMessage: Map<string, ThreadMessageReactionAggregate[]>
): ThreadMessage {
  return {
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
    author: resolveAuthor(m.sender, m.senderId),
    reactions: reactionsByMessage.get(m.id) ?? [],
    _count: { replies: m.replyCount },
    attachments: m.attachments.map((a) => ({
      id: a.id,
      url: a.url,
      type: a.type,
      name: a.name,
      size: toNumberOrNull(a.size),
    })),
    poll: mapPoll(m.poll),
  };
}

async function buildMessageWhereClause(
  threadId: string,
  cursor?: string | null
): Promise<Prisma.MessageWhereInput> {
  const where: Prisma.MessageWhereInput = { threadId, ...IS_NOT_DELETED };
  if (!cursor) return where;
  const cursorMessage = await prisma.message.findUnique({
    where: { id: cursor },
    select: { createdAt: true, id: true },
  });
  if (!cursorMessage) return where;
  // KISS: handle same-timestamp messages by tie-breaking on id (cuid is time-ordered)
  // where (createdAt < cursorCreatedAt) OR (createdAt == cursorCreatedAt AND id < cursorId)
  return {
    ...where,
    OR: [
      { createdAt: { lt: cursorMessage.createdAt } },
      { createdAt: cursorMessage.createdAt, id: { lt: cursor } },
    ],
  };
}

async function fetchReactionsByMessage(
  messageIds: string[]
): Promise<Map<string, ThreadMessageReactionAggregate[]>> {
  const byMessage = new Map<string, ThreadMessageReactionAggregate[]>();
  if (messageIds.length === 0) return byMessage;
  const reactionRows = await prisma.reaction.groupBy({
    by: ['messageId', 'emoji'],
    where: { messageId: { in: messageIds } },
    _count: { _all: true },
  });
  for (const r of reactionRows) {
    const list = byMessage.get(r.messageId) ?? [];
    list.push({ type: r.emoji, _count: r._count._all });
    byMessage.set(r.messageId, list);
  }
  return byMessage;
}

export async function getThreadMessagesPaginated(
  threadId: string,
  cursor?: string | null,
  limit: number = 50
): Promise<PaginatedMessagesResult> {
  const effectiveLimit = Math.min(Math.max(limit, 1), 100);
  const where = await buildMessageWhereClause(threadId, cursor);

  const messagesPromise = prisma.message.findMany({
    where,
    include: {
      sender: { select: { id: true, name: true, image: true } },
      attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
      poll: { include: { votes: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: effectiveLimit + 1,
  });
  // KISS: count messages directly instead of relying on denormalized thread.messageCount
  // which requires an extra thread lookup and fails when prisma.thread is mocked
  const totalCountPromise = prisma.message.count({
    where: { threadId, deletedAt: null },
  });
  const [messages, totalCount] = await Promise.all([messagesPromise, totalCountPromise]);

  const hasMore = messages.length > effectiveLimit;
  const page = hasMore ? messages.slice(0, effectiveLimit) : messages;
  const messageIds = page.map((m) => m.id);
  const reactionsByMessage = await fetchReactionsByMessage(messageIds);

  return {
    messages: page.map((m) => mapDbMessageToThreadMessage(m as never, reactionsByMessage)),
    hasMore,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    totalCount,
  };
}

async function fetchThreadRow(slug: string, uid: string): Promise<ThreadRow | null> {
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
        CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
          'id', u.id,
          'name', u.name,
          'image', u.image
        ) END as author,
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
      LEFT JOIN "users" u ON u.id = s."createdBy"
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
  return rows[0] ?? null;
}

async function isPrivateThreadAccessible(row: ThreadRow, userId?: string): Promise<boolean> {
  if (row.visibility === 'PUBLIC') return true;
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return canAccessThread(
    { threadId: row.id, createdBy: row.createdBy, visibility: row.visibility as ThreadVisibility },
    userId,
    user?.role ?? Role.USER
  );
}

function mapThreadRowToDto(row: ThreadRow): ThreadWithFullContext {
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

export const getThreadWithFullContext = cache(
  async (slug: string, userId?: string): Promise<ThreadWithFullContext | null> => {
    const uid = userId ?? '';
    const row = await fetchThreadRow(slug, uid);
    if (!row) return null;
    const allowed = await isPrivateThreadAccessible(row, userId);
    if (!allowed) return null;
    return mapThreadRowToDto(row);
  }
);