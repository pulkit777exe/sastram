
import type { ReactNode } from 'react';
import { Users, MessageSquare, Star, ChevronDown, TrendingUp } from 'lucide-react';
import { Prisma } from '@prisma/client';
import { isAdmin, getSession } from '@/modules/auth/session';
import { listThreads } from '@/modules/threads/repository';
import { listCommunities } from '@/modules/communities/repository';
import { TopicGrid } from '@/components/dashboard/topic-grid';
import { Card, CardContent } from '@/components/ui/card';
import { ThreadInsights } from '@/components/dashboard/thread-insights';
import { CreateTopicButton } from '@/components/dashboard/create-topic-button';
import { CreateThreadDialog } from '@/components/create-thread-dialog';
import { cn } from '@/lib/utils/cn';
import { prisma } from '@/lib/infrastructure/prisma';
import Link from 'next/link';

function parseTagFilter(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((v) => v.split(','))
    .map((t) => t.trim().toLowerCase())
    .filter((t, i, all) => t.length > 0 && all.indexOf(t) === i);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>;
}) {
  const params = await searchParams;
  const selectedTags = parseTagFilter(params.tag);
  const session = await getSession();
  if (!session) return null;

  const [{ threads }, communities, topicThreads] = await Promise.all([
    listThreads(),
    listCommunities(),
    prisma.thread.findMany({
      where:
        selectedTags.length > 0
          ? {
              AND: selectedTags.map((tagSlug) => ({
                tags: { some: { tag: { slug: tagSlug } } },
              })),
            }
          : {},
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        messageCount: true,
        community: { select: { title: true } },
        tags: { select: { tag: { select: { name: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ]);

  const threadIds = topicThreads.map((s) => s.id);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [readReceiptRows, activeUserCounts, unreadCounts] = await Promise.all([
    threadIds.length > 0
      ? prisma.readReceipt
          .findMany({
            where: {
              userId: session.user.id,
              threadId: { in: threadIds },
            },
            select: {
              threadId: true,
              readAt: true,
            },
          })
          .catch((err) => {
            console.error('[dashboard.readReceipts]', err);
            return [];
          })
      : [],
    threadIds.length > 0
      ? prisma.$queryRaw<Array<{ threadId: string; uniqueUsers: bigint }>>`
          SELECT "threadId", COUNT(DISTINCT "senderId")::bigint as "uniqueUsers"
          FROM "messages"
          WHERE "threadId" IN (${Prisma.join(threadIds)})
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${sevenDaysAgo}
          GROUP BY "threadId"
        `
      : [],
    threadIds.length > 0
      ? prisma.$queryRaw<Array<{ threadId: string; unread: bigint }>>`
          SELECT m."threadId", COUNT(*)::bigint as "unread"
          FROM "messages" m
          LEFT JOIN "read_receipts" rr ON rr."threadId" = m."threadId" AND rr."userId" = ${session.user.id}
          WHERE m."threadId" IN (${Prisma.join(threadIds)})
            AND m."deletedAt" IS NULL
            AND m."senderId" != ${session.user.id}
            AND (rr."readAt" IS NULL OR m."createdAt" > rr."readAt")
          GROUP BY m."threadId"
        `
      : [],
  ]);

  const readAtByThread = new Map(readReceiptRows.map((row) => [row.threadId, row.readAt]));
  const activeUserMap = new Map(activeUserCounts.map((r) => [r.threadId, Number(r.uniqueUsers)]));
  const unreadMap = new Map(unreadCounts.map((r) => [r.threadId, Number(r.unread)]));

  const totalMessages = topicThreads.reduce((acc, t) => acc + t.messageCount, 0);

  const threadTopics = topicThreads.map((thread) => {
    return {
      id: thread.id,
      slug: thread.slug,
      name: thread.name,
      description: thread.description ?? 'No description',
      activeUsers: activeUserMap.get(thread.id) ?? 0,
      messagesCount: thread._count.messages,
      unreadCount: unreadMap.get(thread.id) ?? 0,
      trending: thread._count.messages > 10,
      tags:
        thread.tags.length > 0
          ? thread.tags.map((rel) => rel.tag.name)
          : [thread.community?.title ?? 'general'],
    };
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Threads</h1>
          <p className="text-zinc-500 mt-1">Manage and track your community discussions.</p>
        </div>
        <div className="flex gap-3">
          <div className="border rounded-lg px-4 py-2 flex items-center gap-2 cursor-pointer text-sm transition-colors">
            <span className="font-medium">View:</span>
            <span>Timeline</span>
            <ChevronDown size={14} />
          </div>
          {isAdmin(session.user) && <CreateTopicButton />}
          <CreateThreadDialog communities={communities.map(c => ({ id: c.id, title: c.title }))} />
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Filtering by:</span>
          {selectedTags.map((tag) => (
            <Link
              key={tag}
              href="/dashboard"
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
            >
              #{tag} ×
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DarkMetric
          label="Active threads"
          value={topicThreads.length}
          icon={<MessageSquare size={18} />}
          color="blue"
        />
        <DarkMetric
          label="Total Messages"
          value={totalMessages}
          icon={<Users size={18} />}
          color="indigo"
        />
        <DarkMetric
          label="Communities"
          value={communities.length}
          icon={<Star size={18} />}
          color="amber"
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest">Communities</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <Card key={community.id} className="transition-all group cursor-pointer">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-secondary transition-colors">
                    <Users size={20} />
                  </div>
                  {community.threadCount > 5 && (
                    <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
                      ACTIVE
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold">{community.title}</h3>
                <p className="mt-1 text-sm line-clamp-2">
                  {community.description ?? 'No description yet.'}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-medium">{community.threadCount} threads</span>
                  <div className="h-1 w-1 rounded-full bg-zinc-700" />
                  <span className="text-xs font-medium">Updated today</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp size={18} className="text-indigo-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest">Trending Threads</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl overflow-hidden">
            <TopicGrid topics={threadTopics} />
          </div>
          <ThreadInsights initialThreads={threads} />
        </div>
      </section>
    </div>
  );
}

function DarkMetric({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10',
    indigo: 'text-indigo-400 bg-indigo-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
  };

  return (
    <div className="border p-5 rounded-2xl flex items-center gap-4 transition-colors">
      <div className={cn('p-3 rounded-xl', colors[color] ?? colors.blue)}>{icon}</div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
