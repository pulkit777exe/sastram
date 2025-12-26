import { notFound } from "next/navigation";
import { CommentTree } from "@/components/thread/comment-tree";
import { PostMessageForm } from "@/modules/chat/components/post-message-form";
import { ThreadSubscribeButton } from "@/components/thread/subscribe-button";
import { InviteFriendButton } from "@/components/thread/invite-friend-button";
import {
  Hash,
  Sparkles,
  Users,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type { Message } from "@/lib/types/index";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { getThreadBySlug } from "@/modules/threads/repository";
import { subscribeToThreadAction } from "@/modules/newsletter/actions";
import { isUserSubscribedToThread } from "@/modules/newsletter/repository";
import type {
  MessageWithDetails,
  AttachmentInfo,
} from "@/modules/threads/types";
import Link from "next/link";

export default async function ThreadPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params;
  const session = await requireSession();
  const thread = await getThreadBySlug(slug);

  if (!thread) notFound();

  const subscribed = await isUserSubscribedToThread(thread.id, session.user.id);
  const subscribeAction = subscribeToThreadAction.bind(null, {
    threadId: thread.id,
    slug: thread.slug,
  });

  // Map all messages including nested ones
  const allMessages: Message[] = thread.messages.map(
    (m: MessageWithDetails) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      senderId: m.senderId,
      parentId: m.parentId || null,
      sender: {
        name: m.sender?.name || "Anonymous",
        image: m.sender?.avatarUrl || null,
      },
      attachments: (m.attachments || []).map((att: AttachmentInfo) => ({
        id: att.id,
        name: att.name ?? null,
        url: att.url,
        type: att.type,
        size: att.size ?? null
          ? typeof att.size === "string"
            ? parseInt(att.size, 10)
            : Number(att.size)
          : null,
      })),
    })
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#161618]">
      <main className="flex flex-1 flex-col min-w-0 border-r border-zinc-800/50">
        <header className="flex h-20 items-center justify-between px-8 border-b border-zinc-800/30">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Hash size={20} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {thread.name}
              </h1>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                  Active Discussion
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#1C1C1E] border border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-2 cursor-pointer text-xs text-zinc-400">
              <TrendingUp size={14} />
              <span>Trending</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#141416]">
          <div className="max-w-4xl mx-auto p-6">
            {allMessages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-zinc-400 mb-4">
                  No comments yet. Be the first to comment!
                </p>
              </div>
            ) : (
              <CommentTree
                messages={allMessages}
                sectionId={thread.id}
                currentUser={session.user}
              />
            )}
          </div>
        </div>

        <div className="border-t border-zinc-800/50 bg-[#161618] p-4">
          <PostMessageForm sectionId={thread.id} />
        </div>
      </main>

      <aside className="w-[340px] flex flex-col bg-[#161618] overflow-y-auto">
        <div className="p-8 border-b border-zinc-800/50">
          <div className="flex items-center gap-2 mb-6">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
              Thread Details
            </p>
          </div>

          <h2 className="text-lg font-bold text-white mb-3">{thread.name}</h2>
          <p className="text-sm text-zinc-500 leading-relaxed mb-8">
            {thread.description}
          </p>

          <div className="space-y-4 bg-[#1C1C1E] p-4 rounded-xl border border-zinc-800/50">
            <StatLine
              icon={<Users size={14} />}
              label="Active Members"
              value={thread.activeUsers}
            />
            <StatLine
              icon={<MessageSquare size={14} />}
              label="Total Messages"
              value={thread.messageCount}
            />
          </div>

          <form action={subscribeAction} className="mt-8">
            <ThreadSubscribeButton subscribed={subscribed} />
          </form>

          <div className="mt-4">
            <InviteFriendButton threadId={thread.id} threadName={thread.name} />
          </div>
        </div>

        <div className="p-6">
          <div className="rounded-2xl bg-linear-to-br from-[#1C1C1E] to-[#161618] border border-zinc-800 p-6 relative overflow-hidden group">
            <div className="flex items-center gap-2 mb-3 text-white">
              <Sparkles size={16} className="text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-widest">
                AI Synthesis
              </span>
            </div>

            <div className="relative z-10">
              {thread.summary ? (
                <p className="text-sm text-zinc-400 leading-relaxed italic">
                  &apos;{thread.summary}&apos;
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="h-2 w-full bg-zinc-800 rounded animate-pulse" />
                  <div className="h-2 w-3/4 bg-zinc-800 rounded animate-pulse" />
                  <p className="text-[10px] text-zinc-600 mt-2 italic">
                    Analyzing recent logs...
                  </p>
                </div>
              )}
            </div>

            <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-500/5 blur-2xl rounded-full" />
          </div>
        </div>

        {isAdmin(session.user) && (
          <div className="p-6 mt-auto">
            <div className="rounded-xl border border-dashed border-zinc-800 p-5">
              <div className="flex items-center gap-2 mb-3 text-zinc-300">
                <ShieldCheck size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">
                  Admin
                </span>
              </div>
              <Link
                href="/dashboard/admin"
                className="block w-full text-center py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Manage Lifecycle
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium">
        <span className="text-zinc-600">{icon}</span>
        {label}
      </div>
      <span className="text-sm font-bold text-white tabular-nums">{value}</span>
    </div>
  );
}
