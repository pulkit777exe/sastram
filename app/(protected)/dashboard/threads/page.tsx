import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Hash, MessageSquare, Clock } from 'lucide-react';
import { requireSession } from '@/modules/auth/session';
import { listThreads } from '@/modules/threads/repository';
import type { ThreadSummary } from '@/modules/threads/types';
import TimeAgo from '@/components/ui/TimeAgo';
import { CreateThreadDialog } from '@/components/thread/create-thread-dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Threads - Sastram',
  description: 'Browse and manage your threads.',
};

function ThreadListSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card shadow-linear-xs">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-border/60 p-4 last:border-b-0"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreadRow({ thread }: { thread: ThreadSummary }) {
  return (
    <Link
      href={`/dashboard/threads/${thread.slug}`}
      className="group flex items-start gap-3 border-b border-border/60 p-4 transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-primary-foreground">
        <Hash size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-brand transition-colors">
            {thread.name}
          </h3>
        </div>
        {thread.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{thread.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare size={10} />
            {thread.messageCount}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} />
            <TimeAgo date={thread.updatedAt} />
          </span>
        </div>
      </div>
    </Link>
  );
}

async function ThreadList({ userId }: { userId: string }) {
  const { threads } = await listThreads({ memberUserId: userId, pageSize: 50 });

  if (threads.length === 0) {
    return (
      <div className="text-center py-16">
        <Hash size={32} className="mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No threads yet</p>
        <p className="text-xs text-muted-foreground mt-1">Create a thread to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-linear-xs">
      {threads.map((thread) => (
        <ThreadRow key={thread.id} thread={thread} />
      ))}
    </div>
  );
}

export default async function ThreadsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Threads</h1>
          <p className="text-sm text-muted-foreground mt-1">Your discussions and topics.</p>
        </div>
        <CreateThreadDialog />
      </div>

      <Suspense fallback={<ThreadListSkeleton />}>
        <ThreadList userId={session.user.id} />
      </Suspense>
    </div>
  );
}
