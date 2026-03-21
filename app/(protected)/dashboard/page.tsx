// ════════════════════════════════════════════════════════
// dashboard/page.tsx
// ════════════════════════════════════════════════════════
// ReadReceipt actual shape (confirmed from TS errors):
//   { id, threadId, userId, lastReadMessageId, readAt, createdAt, updatedAt }
// Key field: threadId (NOT sectionId)
// Timestamp: readAt (NOT lastReadAt)
//
// Fix: use prisma.readReceipt.findMany with correct field names.

import type { ReactNode } from "react";
import {
  Users,
  MessageSquare,
  Star,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import { isAdmin, getSession } from "@/modules/auth/session";
import { listThreads } from "@/modules/threads/repository";
import { listCommunities } from "@/modules/communities/repository";
import { TopicGrid } from "@/components/dashboard/topic-grid";
import { Card, CardContent } from "@/components/ui/card";
import { ThreadInsights } from "@/components/dashboard/thread-insights";
import { CreateTopicButton } from "@/components/dashboard/create-topic-button";
import { cn } from "@/lib/utils/cn";
import { prisma } from "@/lib/infrastructure/prisma";
import Link from "next/link";

function parseTagFilter(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((v) => v.split(","))
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

  const [{ threads }, communities, topicSections] = await Promise.all([
    listThreads(),
    listCommunities(),
    prisma.section.findMany({
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
        messages: { select: { senderId: true, createdAt: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  // ReadReceipt uses `threadId` to reference the section (despite the name)
  // and `readAt` as the timestamp field — confirmed from Prisma-generated types
  const sectionIds = topicSections.map((s) => s.id);

  const readReceiptRows =
    sectionIds.length > 0
      ? await prisma.readReceipt
          .findMany({
            where: {
              userId: session.user.id,
              threadId: { in: sectionIds }, // threadId maps to section in this schema
            },
            select: {
              threadId: true,
              readAt: true,
            },
          })
          .catch((err) => {
            console.error("[dashboard.readReceipts]", err);
            return [];
          })
      : [];

  const readAtByThread = new Map(
    readReceiptRows.map((row) => [row.threadId, row.readAt]),
  );

  const totalMessages = topicSections.reduce(
    (acc, t) => acc + t.messageCount,
    0,
  );

  const threadTopics = topicSections.map((thread) => {
    const readAt = readAtByThread.get(thread.id);

    const unreadCount = thread.messages.filter((msg) => {
      if (msg.senderId === session.user.id) return false;
      if (!readAt) return true;
      return msg.createdAt > readAt;
    }).length;

    return {
      id: thread.id,
      slug: thread.slug,
      title: thread.name,
      description: thread.description ?? "No description",
      activeUsers: new Set(thread.messages.map((m) => m.senderId)).size,
      messagesCount: thread._count.messages,
      unreadCount,
      trending: thread._count.messages > 10,
      tags:
        thread.tags.length > 0
          ? thread.tags.map((rel) => rel.tag.name)
          : [thread.community?.title ?? "general"],
    };
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Threads</h1>
          <p className="text-zinc-500 mt-1">
            Manage and track your community discussions.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="border rounded-lg px-4 py-2 flex items-center gap-2 cursor-pointer text-sm transition-colors">
            <span className="font-medium">View:</span>
            <span>Timeline</span>
            <ChevronDown size={14} />
          </div>
          {isAdmin(session.user) && <CreateTopicButton />}
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            Filtering by:
          </span>
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
          value={topicSections.length}
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
        <h2 className="text-sm font-bold uppercase tracking-widest">
          Communities
        </h2>
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
                  {community.description ?? "No description yet."}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {community.threadCount} threads
                  </span>
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
          <h2 className="text-sm font-bold uppercase tracking-widest">
            Trending Threads
          </h2>
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
    blue: "text-blue-400 bg-blue-400/10",
    indigo: "text-indigo-400 bg-indigo-400/10",
    amber: "text-amber-400 bg-amber-400/10",
  };

  return (
    <div className="border p-5 rounded-2xl flex items-center gap-4 transition-colors">
      <div className={cn("p-3 rounded-xl", colors[color] ?? colors.blue)}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}