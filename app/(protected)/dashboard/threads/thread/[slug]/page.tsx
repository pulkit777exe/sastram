import { notFound } from "next/navigation";
import { ThreadLiveWrapper } from "@/components/thread/thread-live-wrapper";
import { ThreadSubscribeButton } from "@/components/thread/subscribe-button";
import { InviteFriendButton } from "@/components/thread/invite-friend-button";
import {
  Hash,
  Users,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Activity,
} from "lucide-react";
import type { Message } from "@/lib/types/index";
import { isAdmin, requireSession } from "@/modules/auth/session";
import { getThreadWithFullContext } from "@/modules/threads";
import { subscribeToThreadAction } from "@/modules/newsletter/actions";
import Link from "next/link";
import TimeAgo from "@/components/ui/TimeAgo";
import { ThreadManagementControls } from "@/components/thread/thread-management-controls";
import ResolutionScoreCard from "@/components/panels/ResolutionScoreCard";
import ThreadDnaCard from "@/components/panels/ThreadDnaCard";
import { parseThreadDna } from "@/lib/schemas/thread-dna";
import { ThreadSummaryCard } from "@/components/thread/thread-summary-card";

export default async function ThreadPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params;
  const session = await requireSession();
  const thread = await getThreadWithFullContext(slug, session.user.id);

  if (!thread) notFound();

  const threadDna = parseThreadDna(thread.threadDna);
  const canManagePoll =
    thread.createdBy === session.user.id ||
    ["ADMIN", "MODERATOR"].includes(session.user.role);

  const subscribeAction = async () => {
    "use server";
    await subscribeToThreadAction({
      threadId: thread.id,
      slug: thread.slug,
    });
  };

  const allMessages: Message[] = thread.messages.map((m) => ({
    id: m.id,
    content: m.body,
    createdAt: m.createdAt,
    senderId: m.senderId,
    parentId: m.parentId || null,
    sectionId: thread.id,
    depth: m.depth ?? 0,
    isEdited: m.isEdited ?? false,
    isPinned: m.isPinned ?? false,
    likeCount: m.likeCount ?? 0,
    replyCount: m.replyCount ?? 0,
    isAiResponse: m.isAI ?? false,
    updatedAt: m.createdAt,
    deletedAt: m.deletedAt ?? null,
    sender: {
      id: m.senderId,
      name: m.author?.name || "Anonymous",
      image: m.author?.image || null,
    },
    attachments: (m.attachments || []).map((att) => ({
      id: att.id,
      name: att.name ?? null,
      url: att.url,
      type: att.type,
      size: att.size ?? null,
    })),
    section: {
      id: thread.id,
      name: thread.title,
      slug: thread.slug,
    },
  }));

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <main className="flex flex-1 flex-col min-w-0 border-r border-border/60">
        <header className="flex h-[72px] items-center justify-between px-6 border-b border-border/60 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 z-10">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-sm">
              <Hash size={20} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                {thread.title}
              </h1>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                  Live Discussion
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex border rounded-full px-3 py-1 items-center gap-1.5 cursor-help transition-colors hover:bg-indigo-50 text-indigo-600">
              <TrendingUp size={13} />
              <span className="text-xs font-semibold">Trending Topic</span>
            </div>
            <ThreadManagementControls
              threadId={thread.id}
              creatorId={thread.createdBy}
              currentUserId={session.user.id}
              threadName={thread.title}
            />
          </div>
        </header>

        <ThreadLiveWrapper
          messages={allMessages}
          threadId={thread.id}
          poll={
            thread.poll
              ? {
                  id: thread.poll.id,
                  question: thread.poll.question,
                  options: thread.poll.options,
                  isActive: thread.poll.isActive,
                  expiresAt: thread.poll.expiresAt,
                }
              : null
          }
          canManagePoll={canManagePoll}
          currentUser={{
            id: session.user.id,
            name: session.user.name || "User",
            image: session.user.image || null,
            role: session.user.role,
          }}
        />
      </main>

      <aside className="w-[320px] hidden xl:flex flex-col overflow-y-auto bg-background/50">
        <div className="p-6 border-b border-border/60">
          <div className="flex items-center gap-2 mb-6">
            <Activity size={14} className="" />
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              Thread Details
            </p>
          </div>

          <h2 className="text-xl font-bold mb-3 text-foreground">
            {thread.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            {thread.description}
          </p>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <StatCard
              icon={<Users size={16} />}
              label="Members"
              value={thread._count.members}
            />
            <StatCard
              icon={<MessageSquare size={16} />}
              label="Messages"
              value={thread._count.messages}
            />
          </div>

          <form action={subscribeAction}>
            <ThreadSubscribeButton
              subscribed={thread.isSubscribed}
              threadName={thread.title}
              threadId={thread.id}
            />
          </form>

          <div className="mt-3">
            <InviteFriendButton
              threadId={thread.id}
              threadName={thread.title}
            />
          </div>
        </div>

        <div className="p-6 space-y-6">
          <ThreadSummaryCard 
            threadId={thread.id}
            initialSummary={thread.aiSummary}
            className=""
          />

          <ResolutionScoreCard score={thread.resolutionScore} />

          {threadDna && <ThreadDnaCard dna={threadDna} />}

          {thread.isOutdated && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-[10px] text-amber-600 font-medium mb-2 uppercase tracking-wider">
                Stale Content Warning
              </p>
              <p className="text-xs text-amber-800">
                This thread may contain outdated information that contradicts
                newer content.
              </p>
            </div>
          )}

          <div>
            <p className="text-[10px] text-zinc-400 font-medium mb-2 uppercase tracking-wider">
              Created
            </p>
            <p className="text-xs text-zinc-600 font-medium">
              <TimeAgo date={thread.createdAt} />
            </p>
          </div>
        </div>

        {isAdmin(session.user) && (
          <div className="p-6 mt-auto border-t border-border/60">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Admin Controls
                </span>
              </div>
            </div>
            <Link
              href="/dashboard/admin"
              className="flex items-center justify-center w-full py-2.5 text-xs font-medium text-zinc-60 border rounded-lg hover:text-zinc-900 transition-all shadow-sm"
            >
              Manage Thread
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col p-3 rounded-xl border border-border/60 bg-card/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-lg font-bold text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}
