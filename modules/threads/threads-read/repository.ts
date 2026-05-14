import { prisma } from '@/lib/infrastructure/prisma';
import type { Prisma } from '@prisma/client';
import { dedupe } from '@/lib/dedupe';

export type ThreadMessageReactionAggregate = {
  type: string;
  _count: number;
};

export type ThreadMessage = {
  id: string;
  body: string;
  sectionId: string;
  senderId: string;
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
  title: string;
  slug: string;
  description: string | null;
  createdBy: string;
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
  poll: ThreadPoll;
  _count: {
    messages: number;
    members: number;
  };
  isBookmarked: boolean;
  isSubscribed: boolean;
};

type ThreadRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  createdBy: string;
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
  tags: ThreadTag[] | null;
  members: ThreadMember[] | null;
  messages: ThreadMessage[] | null;
  poll: ThreadPoll | null;
  message_count: number | null;
  member_count: number | null;
  is_bookmarked: boolean | null;
  is_subscribed: boolean | null;
};

export async function getThreadWithFullContext(
  slug: string,
  userId: string
): Promise<ThreadWithFullContext | null> {
  return dedupe(`threads:full:${slug}:${userId}`, async () => {
    const rows = await prisma.$queryRaw<ThreadRow[]>`
      SELECT
        s.id,
        s.name as title,
        s.slug,
        s.description as description,
        s."createdBy" as "createdBy",
        s."aiSummary" as "aiSummary",
        s."resolutionScore" as "resolutionScore",
        s."isOutdated" as "isOutdated",
        s."threadDna" as "threadDna",
        s."createdAt" as "createdAt",
        json_build_object(
          'id', u.id,
          'name', u.name,
          'image', u.image
        ) as author,
        COALESCE(tags.tags, '[]'::json) as tags,
        COALESCE(members.members, '[]'::json) as members,
        COALESCE(msgs.messages, '[]'::json) as messages,
        COALESCE(poll.poll, 'null'::json) as poll,
        COALESCE(counts.message_count, 0) as message_count,
        COALESCE(counts.member_count, 0) as member_count,
        EXISTS (
          SELECT 1 FROM "user_bookmarks" b
          WHERE b."threadId" = s.id AND b."userId" = ${userId}
        ) as is_bookmarked,
        EXISTS (
          SELECT 1 FROM "thread_subscriptions" ts
          WHERE ts."threadId" = s.id AND ts."userId" = ${userId} AND ts."isActive" = true
        ) as is_subscribed
      FROM "sections" s
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
        SELECT json_agg(
          json_build_object(
            'user', json_build_object('id', mu.id, 'name', mu.name, 'image', mu.image),
            'role', sm.role
          )
        ) as members
        FROM "section_members" sm
        JOIN "users" mu ON mu.id = sm."userId"
        WHERE sm."sectionId" = s.id AND sm.status = 'ACTIVE'
      ) members ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(mrow.message ORDER BY mrow.created_at) as messages
        FROM (
          SELECT
            m."createdAt" as created_at,
            json_build_object(
              'id', m.id,
              'body', m.content,
              'sectionId', m."sectionId",
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
          WHERE m."sectionId" = s.id
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
        WHERE p."threadId" = s.id
      ) poll ON true
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COUNT(*)::int FROM "messages" m2 WHERE m2."sectionId" = s.id AND m2."deletedAt" IS NULL) as message_count,
          (SELECT COUNT(*)::int FROM "section_members" sm2 WHERE sm2."sectionId" = s.id AND sm2.status = 'ACTIVE') as member_count
      ) counts ON true
      WHERE s.slug = ${slug}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    const aiSearchSession: ThreadAiSearchSession = null;

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description ?? null,
      createdBy: row.createdBy,
      coverImage: null,
      aiSummary: row.aiSummary ?? null,
      resolutionScore: row.resolutionScore ?? null,
      isOutdated: row.isOutdated,
      threadDna: row.threadDna ?? null,
      createdAt: row.createdAt,
      author: row.author,
      messages: (row.messages ?? []) as ThreadMessage[],
      tags: (row.tags ?? []) as ThreadTag[],
      aiSearchSession,
      members: (row.members ?? []) as ThreadMember[],
      poll: (row.poll ?? null) as ThreadPoll,
      _count: {
        messages: row.message_count ?? 0,
        members: row.member_count ?? 0,
      },
      isBookmarked: row.is_bookmarked ?? false,
      isSubscribed: row.is_subscribed ?? false,
    };
  });
}
