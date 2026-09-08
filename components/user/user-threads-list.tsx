'use client';

import Link from 'next/link';
import { MessageSquare, Calendar, Users } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import { ROUTES } from '@/lib/config/routes';
import { Button } from '@/components/ui/button';

interface Thread {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  messageCount: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface UserThreadsListProps {
  threads: Thread[];
}

export function UserThreadsList({ threads }: UserThreadsListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <MessageSquare size={22} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-ink">No threads yet</p>
        <p className="text-sm text-ink-3 mt-1 max-w-sm">This user hasn&apos;t created any threads yet.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/threads">Browse threads</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {threads.map((thread) => (
        <div key={thread.id}>
          <Link
            href={ROUTES.THREAD(thread.slug)}
            className="block rounded-card border border-line bg-surface p-4 hover:bg-hover shadow-card transition-colors"
          >
            <h3 className="font-semibold text-ink mb-2">{thread.name}</h3>
            {thread.description && (
              <p className="text-sm text-ink-3 mb-3 line-clamp-2">
                {thread.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-ink-3">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {thread.messageCount}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {thread.memberCount}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <TimeAgo date={thread.createdAt} />
              </span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
