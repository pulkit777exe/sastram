import type { ReactNode } from "react";
import { Users, MessageSquare, Star, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { listThreads } from "@/modules/threads/repository";
import { listCommunities } from "@/modules/communities/repository";
import { TopicGrid } from "@/components/dashboard/topic-grid";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThreadInsights } from "@/components/dashboard/thread-insights";

export default async function DashboardPage() {
  const session = await requireSession();
  const [threads, communities] = await Promise.all([listThreads(), listCommunities()]);

  const totalMessages = threads.reduce((acc, thread) => acc + thread.messageCount, 0);
  const activeThreads = threads.length;

  const threadTopics = threads.map((thread) => ({
    id: thread.id,
    slug: thread.slug,
    title: thread.title,
    description: thread.description || "No description",
    activeUsers: thread.activeUsers,
    messagesCount: thread.messageCount,
    trending: thread.messageCount > 10,
    tags: [thread.community?.title ?? "General"],
  }));

  return (
    <div className="space-y-8">
      <section className="rounded-4xl border border-slate-100 bg-white bg-linear-to-br from-white via-slate-50 to-slate-100 p-6 shadow-sm lg:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-slate-400">Welcome back</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">
              {session.user.name || session.user.email}
            </h1>
            <p className="mt-2 text-slate-600">
              Track conversations, curate communities, and amplify meaningful discussions.
            </p>
          </div>

          <div className="flex w-full flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <Metric label="Active threads" value={activeThreads} icon={<MessageSquare />} />
            <Metric label="Messages today" value={totalMessages} icon={<Users />} />
            <Metric label="Communities" value={communities.length} icon={<Star />} />
          </div>
        </div>

        {isAdmin(session.user) && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/dashboard/admin">
              <Button className="rounded-full bg-slate-900 px-6 py-2 text-white hover:bg-slate-800">
                Open admin workspace
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4" />
              Admin controls: create communities, threads & digests
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Communities</h2>
            <p className="text-sm text-slate-500">Where your people gather.</p>
          </div>
          {isAdmin(session.user) && (
            <Link href="/dashboard/admin">
              <Button variant="outline" className="rounded-full">
                Manage
              </Button>
            </Link>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <Card key={community.id} className="rounded-3xl border-slate-100 bg-white shadow-sm">
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-wide text-slate-400">Community</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{community.title}</h3>
                <p className="mt-2 text-sm text-slate-500 line-clamp-2">
                  {community.description || "No description yet."}
                </p>
                <p className="mt-4 text-xs text-slate-400">
                  {community.threadCount} thread{community.threadCount === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          ))}
          {communities.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              No communities yet. {isAdmin(session.user) ? "Create one from the admin workspace." : ""}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Trending threads</h2>
            <p className="text-sm text-slate-500">Click a thread to jump into the conversation.</p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <TopicGrid topics={threadTopics} />
          <ThreadInsights initialThreads={threads} />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-2xl bg-slate-50/70 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500">
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
