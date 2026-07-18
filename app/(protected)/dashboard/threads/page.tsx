import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Hash, MessageSquare, Clock } from 'lucide-react';
import { requireSession } from '@/modules/auth/session';
import { listThreads } from '@/modules/threads/repository';
import type { ThreadSummary } from '@/modules/threads/types';
import TimeAgo from '@/components/ui/TimeAgo';
import { CreateThreadDialog } from '@/components/create-thread-dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Threads - Sastram',
  description: 'Browse and manage your threads.',
};

function ThreadListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-border/60">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
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
      href={`/thread/${thread.slug}`}
      className="flex items-start gap-3 p-4 rounded-xl border border-border/60 hover:bg-accent/50 transition-colors group"
    >
      <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
        <Hash size={14} className="text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-brand transition-colors">
            {thread.name}
          </h3>
        </div>
        {thread.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{thread.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
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
    <div className="space-y-3">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Threads</h1>
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
