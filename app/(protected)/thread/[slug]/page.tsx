import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ChatArea } from "@/modules/chat/components/chat-area";
import { ThreadSubscribeButton } from "@/components/thread/subscribe-button";
import { Hash, Sparkles, Users, MessageSquare, Bell, ArrowLeft, Info, ShieldCheck } from "lucide-react";
import type { Message } from "@/lib/types";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { getThreadBySlug } from "@/modules/threads/repository";
import { subscribeToThreadAction } from "@/modules/newsletter/actions";
import { isUserSubscribedToThread } from "@/modules/newsletter/repository";
import Link from "next/link";

export default async function ThreadPage({ params }: { params: { slug: string } }) {
  const { slug } = await params;
  const session = await requireSession();
  const thread = await getThreadBySlug(slug);

  if (!thread) notFound();

  const subscribed = await isUserSubscribedToThread(thread.id, session.user.id);
  const subscribeAction = subscribeToThreadAction.bind(null, { threadId: thread.id, slug: thread.slug });

  const messages: Message[] = thread.messages.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    senderId: m.senderId,
    sender: { name: m.senderName, image: m.senderAvatar ?? null },
    attachments: [],
  }));

  return (
    <div className="flex h-[calc(100vh-80px)] w-full overflow-hidden bg-white">
      {/* 1. MAIN CONTENT AREA (Center) */}
      <main className="flex flex-1 flex-col min-w-0 bg-[#FBFBFB] border-r border-zinc-200">
        {/* Header - Discord Style */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-zinc-900 rounded-lg text-white">
              <Hash size={18} strokeWidth={3} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-zinc-900 tracking-tight">{thread.title}</h1>
              <p className="text-[10px] font-medium text-zinc-400 truncate max-w-[300px]">
                {thread.description}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
            </div>
          </div>
        </header>

        {/* Chat Canvas */}
        <div className="flex-1 overflow-hidden relative">
          <ChatArea 
            initialMessages={messages} 
            sectionId={thread.id} 
            currentUser={session.user} 
          />
        </div>
      </main>

      {/* 2. THREAD INFO & MEMBERS SIDEBAR (Right) */}
      <aside className="w-[320px] flex flex-col bg-white overflow-y-auto border-l border-zinc-100">
        {/* Section: About */}
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center gap-2 mb-4 text-zinc-400">
            <Info size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Thread Info</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-900 mb-2">{thread.title}</h2>
          <p className="text-xs font-medium text-zinc-500 leading-relaxed mb-6">
            {thread.description}
          </p>
          
          <div className="space-y-2">
            <StatLine icon={<Users size={12} />} label="Participants" value={thread.activeUsers} />
            <StatLine icon={<MessageSquare size={12} />} label="Total Logs" value={thread.messageCount} />
          </div>

          <form action={subscribeAction} className="mt-6">
            <ThreadSubscribeButton subscribed={subscribed} />
          </form>
        </div>

        {/* Section: AI Digest (The Discord 'Pinned' feel) */}
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-2 mb-4 text-zinc-900">
            <Sparkles size={14} className="text-zinc-900" />
            <span className="text-[10px] font-bold uppercase tracking-widest">AI Intelligence</span>
          </div>
          <div className="rounded-2xl bg-white border border-zinc-200 p-4 shadow-sm">
            {thread.summary ? (
              <p className="text-xs font-medium leading-relaxed text-zinc-600 italic">
                &aqout;{thread.summary}&aqout;
              </p>
            ) : (
              <p className="text-xs text-zinc-400 italic">Synthesizing recent logs...</p>
            )}
          </div>
        </div>

        {/* Section: Admin Controls */}
        {isAdmin(session.user) && (
          <div className="p-6">
            <div className="rounded-2xl bg-zinc-900 p-4 text-white shadow-xl">
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <ShieldCheck size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Admin Panel</span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-4">You have full authority over this thread digests and lifecycle.</p>
              <Link href="/dashboard/admin">
                <button className="w-full py-2 bg-white text-zinc-900 rounded-xl text-[11px] font-bold hover:bg-zinc-100 transition-colors">
                  Manage Workspace
                </button>
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatLine({ icon, label, value }: { icon: React.ReactNode, label: string, value: number | string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-zinc-400 font-bold text-[10px] uppercase tracking-tight">
        {icon}
        {label}
      </div>
      <span className="text-xs font-bold text-zinc-900 tabular-nums">{value}</span>
    </div>
  );
}