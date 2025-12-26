import type { ReactNode } from "react";
import { Users, MessageSquare, Star, ChevronDown, TrendingUp } from "lucide-react";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { listThreads } from "@/modules/threads/repository";
import { listCommunities } from "@/modules/communities/repository";
import { TopicGrid } from "@/components/dashboard/topic-grid";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThreadInsights } from "@/components/dashboard/thread-insights";
import { CreateTopicButton } from "@/components/dashboard/create-topic-button";
import { cn } from "@/lib/utils/cn";

export default async function DashboardPage() {
  const session = await requireSession();
  const [threads, communities] = await Promise.all([listThreads(), listCommunities()]);

  const totalMessages = threads.reduce((acc, thread) => acc + thread.messageCount, 0);
  const activeThreads = threads.length;

  const threadTopics = threads.map((thread) => ({
    id: thread.id,
    slug: thread.slug,
    title: thread.name,
    description: thread.description || "No description",
    activeUsers: thread.activeUsers,
    messagesCount: thread.messageCount,
    trending: thread.messageCount > 10,
    tags: [thread.community?.title ?? "General"],
  }));

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Threads</h1>
          <p className="text-zinc-500 mt-1">Manage and track your community discussions.</p>
        </div>
        
        <div className="flex gap-3">
          <div className="bg-[#1C1C1E] border border-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2 cursor-pointer text-sm text-zinc-300 hover:border-zinc-700 transition-colors">
            <span className="text-zinc-500 font-medium">View:</span>
            <span>Timeline</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </div>
          {isAdmin(session.user) && (
            <CreateTopicButton />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DarkMetric label="Active threads" value={activeThreads} icon={<MessageSquare size={18} />} color="blue" />
        <DarkMetric label="Total Messages" value={totalMessages} icon={<Users size={18} />} color="indigo" />
        <DarkMetric label="Communities" value={communities.length} icon={<Star size={18} />} color="amber" />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Communities</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <Card key={community.id} className="bg-[#1C1C1E] border-zinc-800/50 hover:border-zinc-700 transition-all group cursor-pointer">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                    <Users size={20} />
                  </div>
                  {community.threadCount > 5 && (
                    <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
                      ACTIVE
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{community.title}</h3>
                <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
                  {community.description || "No description yet."}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-400">{community.threadCount} threads</span>
                  <div className="h-1 w-1 rounded-full bg-zinc-700" />
                  <span className="text-xs font-medium text-zinc-400">Updated today</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp size={18} className="text-indigo-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Trending Threads</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="bg-[#161618] rounded-2xl border border-zinc-800/50 overflow-hidden">
             <TopicGrid topics={threadTopics} />
          </div>
          <ThreadInsights initialThreads={threads} />
        </div>
      </section>
    </div>
  );
}

function DarkMetric({ label, value, icon, color }: { label: string; value: number | string; icon: ReactNode, color: string }) {
  const colors: Record<string, string> = {
    blue: "text-blue-400 bg-blue-400/10",
    indigo: "text-indigo-400 bg-indigo-400/10",
    amber: "text-amber-400 bg-amber-400/10",
  };

  return (
    <div className="bg-[#1C1C1E] border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 hover:bg-[#202022] transition-colors">
      <div className={cn("p-3 rounded-xl", colors[color] || "bg-zinc-800 text-zinc-400")}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}