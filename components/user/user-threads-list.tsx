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
      {threads.map((thread, index) => (
        <div
          key={thread.id}
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <Link
            href={ROUTES.THREAD(thread.slug)}
            className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
          >
            <h3 className="font-semibold text-foreground mb-2">{thread.name}</h3>
            {thread.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {thread.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
