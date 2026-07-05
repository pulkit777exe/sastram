import { Suspense } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';

function parseTagFilter(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((v) => v.split(','))
    .map((t) => t.trim().toLowerCase())
    .filter((t, i, all) => t.length > 0 && all.indexOf(t) === i);
}

function getDaysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border p-5 rounded-2xl flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunitiesSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-5 space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function TopicGridSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-2xl overflow-hidden border border-border/60 p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-xl">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
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
    brand: 'text-brand bg-brand/10',
    amber: 'text-amber-400 bg-amber-400/10',
  };

  return (
    <div className="border p-5 rounded-2xl flex items-center gap-4 transition-colors">
      <div className={cn('p-3 rounded-xl', colors[color] ?? colors.blue)}>{icon}</div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

async function DashboardMetrics({
  topicThreads,
  communities,
}: {
  topicThreads: { id: string; messageCount: number }[];
  communities: { id: string; title: string; description: string | null; threadCount: number }[];
}) {
  const totalMessages = topicThreads.reduce((acc, t) => acc + t.messageCount, 0);

  return (
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
        color="brand"
      />
      <DarkMetric
        label="Communities"
        value={communities.length}
        icon={<Star size={18} />}
        color="amber"
      />
    </div>
  );
}

async function CommunitiesSection({
  communities,
}: {
  communities: { id: string; title: string; description: string | null; threadCount: number }[];
}) {
  return (
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
                  <span className="bg-brand/10 text-brand text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand/20">
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
  );
}

async function TopicGridWithData({
  topicThreads,
  userId,
}: {
  topicThreads: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    messageCount: number;
    community: { title: string } | null;
    tags: { tag: { name: string } }[];
    _count: { messages: number };
  }[];
  userId: string;
}) {
  const threadIds = topicThreads.map((s) => s.id);
  const sevenDaysAgo = getDaysAgoDate(7);

  const [readReceiptRows, activeUserCounts, unreadCounts] = await Promise.all([
    threadIds.length > 0
      ? prisma.readReceipt
          .findMany({
            where: {
              userId,
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
          LEFT JOIN "read_receipts" rr ON rr."threadId" = m."threadId" AND rr."userId" = ${userId}
          WHERE m."threadId" IN (${Prisma.join(threadIds)})
            AND m."deletedAt" IS NULL
            AND m."senderId" != ${userId}
            AND (rr."readAt" IS NULL OR m."createdAt" > rr."readAt")
          GROUP BY m."threadId"
        `
      : [],
  ]);

  const activeUserMap = new Map(activeUserCounts.map((r) => [r.threadId, Number(r.uniqueUsers)]));
  const unreadMap = new Map(unreadCounts.map((r) => [r.threadId, Number(r.unread)]));

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
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-2xl overflow-hidden">
        <TopicGrid topics={threadTopics} />
      </div>
    </div>
  );
}

async function ThreadInsightsSection({
  threads,
}: {
  threads: Awaited<ReturnType<typeof listThreads>>['threads'];
}) {
  return <ThreadInsights initialThreads={threads} />;
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
              className="rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 text-xs text-brand"
            >
              #{tag} ×
            </Link>
          ))}
        </div>
      )}

      <Suspense fallback={<MetricsSkeleton />}>
        <DashboardMetrics topicThreads={topicThreads} communities={communities} />
      </Suspense>

      <Suspense fallback={<CommunitiesSkeleton />}>
        <CommunitiesSection communities={communities} />
      </Suspense>

      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp size={18} className="text-brand" />
          <h2 className="text-sm font-bold uppercase tracking-widest">Trending Threads</h2>
        </div>
        <Suspense fallback={<TopicGridSkeleton />}>
          <TopicGridWithData topicThreads={topicThreads} userId={session.user.id} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
          <ThreadInsightsSection threads={threads} />
        </Suspense>
      </section>
    </div>
  );
}
