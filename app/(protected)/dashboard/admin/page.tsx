import { requireSession, assertAdmin } from "@/modules/auth/session";
import { listCommunities } from "@/modules/communities/repository";
import { listThreads } from "@/modules/threads/repository";
import { createCommunityAction } from "@/modules/communities/actions";
import {
  createThreadAction,
  deleteThreadAction,
} from "@/modules/threads/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Flag } from "lucide-react";

export default async function AdminDashboardPage() {
  const session = await requireSession();
  assertAdmin(session.user);

  const [communities, threads] = await Promise.all([listCommunities(), listThreads()]);

  return (
    <div className="space-y-8">
      <header className="rounded-4xl border border-slate-800 bg-[radial-gradient(circle_at_top,#101322,#050507)] p-8 text-white shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Admin Workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Create and moderate</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Launch new communities, spin up curated threads, and keep conversations clean. All actions
              sync instantly with TanStack Query powered widgets.
            </p>
          </div>
          <Link href="/dashboard/admin/reports">
            <Button className="bg-red-600 hover:bg-red-500 text-white">
              <Flag className="w-4 h-4 mr-2" />
              View Reports
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-slate-100">
          <CardHeader>
            <CardTitle>Create a community</CardTitle>
            <p className="text-sm text-slate-500">
              Communities are the containers for specialized conversations.
            </p>
          </CardHeader>
          <CardContent>
            <form action={createCommunityAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="community-title">Title</Label>
                <Input id="community-title" name="title" placeholder="Neuro Ethics Council" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="community-description">Description</Label>
                <Textarea
                  id="community-description"
                  name="description"
                  placeholder="A calm, structured exchange on the ethics of AGI."
                />
              </div>
              <Button type="submit" className="w-full rounded-2xl">
                Save community
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-100">
          <CardHeader>
            <CardTitle>Create a thread</CardTitle>
            <p className="text-sm text-slate-500">
              Threads inherit permissions from their parent community.
            </p>
          </CardHeader>
          <CardContent>
            <form action={createThreadAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="thread-title">Title</Label>
                <Input id="thread-title" name="title" placeholder="Photon propulsion L2 sync" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thread-description">Description</Label>
                <Textarea
                  id="thread-description"
                  name="description"
                  placeholder="Gather specs, blockers, open questions."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thread-community">Community</Label>
                <select
                  id="thread-community"
                  name="communityId"
                  className="w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
                >
                  <option value="">No parent community</option>
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full rounded-2xl">
                Publish thread
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Threads</h2>
            <p className="text-sm text-slate-500">Click slug to open the live view.</p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-3">Title</th>
                <th className="pb-3">Community</th>
                <th className="pb-3">Messages</th>
                <th className="pb-3">Slug</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {threads.map((thread) => {
                const deleteAction = deleteThreadAction.bind(null, thread.id);
                return (
                  <tr key={thread.id} className="text-slate-700">
                    <td className="py-3 font-medium">{thread.title}</td>
                    <td className="py-3 text-slate-500">{thread.community?.title ?? "—"}</td>
                    <td className="py-3 text-slate-500">{thread.messageCount}</td>
                    <td className="py-3">
                      <a href={`/thread/${thread.slug}`} className="text-slate-900 underline">
                        {thread.slug}
                      </a>
                    </td>
                    <td className="py-3 text-right">
                      <form action={deleteAction}>
                        <Button variant="ghost" className="text-red-500 hover:text-red-600">
                          Delete
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {threads.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">No threads yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

