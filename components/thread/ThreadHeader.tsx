import type { ThreadWithFullContext } from '@/modules/threads/queries';
import TimeAgo from './TimeAgo';
import { BookmarkButton } from './bookmark-button';
import { Badge } from '@/components/ui/badge';

interface ThreadHeaderProps {
  thread: ThreadWithFullContext;
  isBookmarked: boolean;
  isSubscribed: boolean;
}

function getResolutionState(score: number | null) {
  if (score === null || score === undefined) {
    return {
      label: 'Open',
      variant: 'destructive-subtle' as const,
    };
  }

  if (score >= 70) {
    return {
      label: 'Resolved',
      variant: 'success' as const,
    };
  }

  if (score >= 40) {
    return {
      label: 'In Progress',
      variant: 'warning' as const,
    };
  }

  return {
    label: 'Open',
    variant: 'destructive-subtle' as const,
  };
}

export default function ThreadHeader({ thread, isBookmarked }: ThreadHeaderProps) {
  const resolution = getResolutionState(thread.resolutionScore);

  return (
    <header className="rounded-lg bg-card p-5 shadow-linear-sm">
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span className="font-(--font-dm-mono) text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Thread
            </span>
          </div>

          <h1 className="mt-2.5 truncate font-['Syne'] text-2xl font-extrabold leading-[1.1] text-foreground">
            {thread.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 overflow-hidden rounded-full bg-brand/5" />
              <div className="flex flex-col">
                <span className="font-(--font-dm-sans) text-sm text-foreground">
                  {thread.author.name ?? 'Unknown'}
                </span>
                <TimeAgo date={thread.createdAt} />
              </div>
            </div>

            <span className="mx-2 h-4 w-px bg-border" />

            <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
              <span>{thread._count.messages} messages</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <Badge variant={resolution.variant} className="gap-2 px-2.5 py-1 font-(--font-dm-mono) text-xs uppercase tracking-[0.12em]">
            {resolution.label}
          </Badge>

          <BookmarkButton
            threadId={thread.id}
            className="h-8 rounded-md border border-border bg-brand/10 px-2.5 text-xs font-medium text-foreground"
          />
        </div>
      </div>
    </header>
  );
}
