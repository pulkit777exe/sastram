'use client';

import { use, useTransition } from 'react';
import Link from 'next/link';
import { Flag, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { createThreadAction, deleteThreadAction } from '@/modules/threads/actions';

interface AdminDashboardFormsProps {
  threadsPromise: Promise<{ threads: import('@/modules/threads/types').ThreadSummary[] }>;
}

export function AdminDashboardForms({ threadsPromise }: AdminDashboardFormsProps) {
  const { threads } = use(threadsPromise);
  const [isPending, startTransition] = useTransition();

  const handleCreateThread = async (formData: FormData) => {
    const result = await createThreadAction(formData);
    if (result?.ok === false) {
      toasts.error('Failed to publish thread.', result.error ?? undefined);
    } else {
      toasts.success('Thread published.');
    }
  };

  const handleDeleteThread = (threadId: string) => {
    const fd = new FormData();
    fd.append('threadId', threadId);
    startTransition(async () => {
      const result = await deleteThreadAction(fd);
      if (result?.ok === false) {
        toasts.error('Failed to delete thread.', result.error ?? undefined);
      } else {
        toasts.success('Thread deleted.');
      }
    });
  };

  return (
    <div className="space-y-8">
      <header className="rounded-4xl border border-border admin-header-gradient p-8 text-white shadow-linear-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin Workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Create and moderate</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Publish curated threads and keep conversations clean. Community containers were
              removed; permissions now flow from thread creators and global moderator roles.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard/admin/reports">
              <Button className="bg-red-600 hover:bg-red-500 text-white">
                <Flag className="w-4 h-4 mr-2" />
                View Reports
              </Button>
            </Link>
            <Link href="/dashboard/admin/moderation">
              <Button variant="outline" className="border-white/20 text-white/70 hover:bg-white/10">
                <Flag className="w-4 h-4 mr-2" />
                Moderation
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section>
        <Card className="rounded-3xl border-border">
          <CardHeader>
            <CardTitle>Create a thread</CardTitle>
            <p className="text-sm text-muted-foreground">
              Threads are the top-level discussion surface.
            </p>
          </CardHeader>
          <CardContent>
            <form action={handleCreateThread} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="thread-title">Title</Label>
                <Input
                  id="thread-title"
                  name="title"
                  placeholder="Photon propulsion L2 sync"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thread-description">Description</Label>
                <Textarea
                  id="thread-description"
                  name="description"
                  placeholder="Gather specs, blockers, open questions."
                />
              </div>
              <div className="border rounded-2xl p-4 space-y-3 bg-muted/50">
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-foreground">
                    Add a poll (optional)
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="poll-question">Poll Question</Label>
                  <Input
                    id="poll-question"
                    name="pollQuestion"
                    placeholder="What is your preferred approach?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Options (one per line, at least 2)</Label>
                  <Textarea
                    id="poll-options"
                    name="pollOptions"
                    placeholder="Option A&#10;Option B&#10;Option C"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate each option with a new line.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="poll-expires">Expires at (optional)</Label>
                  <Input
                    id="poll-expires"
                    name="pollExpiresAt"
                    type="datetime-local"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full rounded-2xl">
                Publish thread
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-3xl border border-border bg-white p-6 shadow-linear-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Threads</h2>
            <p className="text-sm text-muted-foreground">Click slug to open the live view.</p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-3">Title</th>
                <th className="pb-3">Messages</th>
                <th className="pb-3">Slug</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {threads.map((thread) => (
                <tr key={thread.id} className="text-foreground">
                  <td className="py-3 font-medium">{thread.name}</td>
                  <td className="py-3 text-muted-foreground">{thread.messageCount}</td>
                  <td className="py-3">
                    <a href={`/dashboard/threads/${thread.slug}`} className="text-foreground underline">
                      {thread.slug}
                    </a>
                  </td>
                  <td className="py-3 text-right">
                    <Button
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      disabled={isPending}
                      onClick={() => handleDeleteThread(thread.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {threads.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No threads yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
