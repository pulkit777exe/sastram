'use client';

import Link from 'next/link';
import { MessageSquare, Calendar, Users } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import { ROUTES } from '@/lib/config/routes';

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
      <div className="text-center py-12 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No threads yet</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {threads.map((thread) => (
        <div key={thread.id}>
          <Link
            href={ROUTES.THREAD(thread.slug)}
            className="block rounded-control border border-line bg-surface p-4 hover:bg-hover transition-colors"
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
