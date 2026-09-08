import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Hash } from 'lucide-react';
import type { Role } from '@prisma/client';
import { requireSession } from '@/modules/auth';
import { listThreads } from '@/modules/threads/repository';
import { CreateThreadDialog } from '@/components/create-thread-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ThreadListFilter } from '@/components/thread/ThreadListFilter';

export const metadata: Metadata = {
  title: 'Threads - Sastram',
  description: 'Browse and manage your threads.',
};

function ThreadListSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-line/60 p-4 last:border-b-0"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-control" />
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

async function ThreadList({ userId, userRole }: { userId: string; userRole: Role }) {
  const { threads } = await listThreads({
    memberUserId: userId,
    memberRole: userRole,
    pageSize: 50,
  });

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Hash size={22} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-ink">No threads yet</p>
        <p className="text-sm text-ink-3 mt-1 max-w-sm">Create a thread to start a discussion — @sai will help track it.</p>
        <div className="mt-4">
          <CreateThreadDialog />
        </div>
      </div>
    );
  }

  return <ThreadListFilter threads={threads} />;
}

export default async function ThreadsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Threads</h1>
          <p className="text-sm text-ink-3 mt-1">Your discussions and topics.</p>
        </div>
        <CreateThreadDialog />
      </div>

      <Suspense fallback={<ThreadListSkeleton />}>
        <ThreadList userId={session.user.id} userRole={session.user.role} />
      </Suspense>
    </div>
  );
}
