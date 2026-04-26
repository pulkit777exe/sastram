import Image from 'next/image';
import type { ThreadWithFullContext } from '@/modules/threads/queries';
import TimeAgo from './TimeAgo';
import { BookmarkButton } from './bookmark-button';

interface ThreadHeaderProps {
  thread: ThreadWithFullContext;
  isBookmarked: boolean;
  isSubscribed: boolean;
}

function getResolutionState(score: number | null) {
  if (score === null || score === undefined) {
    return {
      label: 'Open',
      colorClass: 'bg-(--red)',
    };
  }

  if (score >= 70) {
    return {
      label: 'Resolved',
      colorClass: 'bg-(--green)',
    };
  }

  if (score >= 40) {
    return {
      label: 'In Progress',
      colorClass: 'bg-(--amber)',
    };
  }

  return {
    label: 'Open',
    colorClass: 'bg-(--red)',
  };
}

export default function ThreadHeader({ thread, isBookmarked }: ThreadHeaderProps) {
  const resolution = getResolutionState(thread.resolutionScore);

  return (
    <header className="rounded-[10px] bg-(--surface) p-[20px] shadow-sm">
      <div className="relative h-[140px] w-full overflow-hidden rounded-[10px] bg-thread-cover">
        {thread.coverImage ? (
          <Image
            src={thread.coverImage}
            alt={thread.title}
            fill
            priority
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="mt-[16px] flex items-start justify-between gap-[16px]">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-[8px] rounded-[999px] bg-(--blue-dim) px-[10px] py-[4px]">
            <span className="h-[8px] w-[8px] rounded-full bg-(--blue)" />
            <span className="font-(--font-dm-mono) text-[10px] uppercase tracking-[0.12em] text-muted">
              Thread
            </span>
          </div>

          <h1 className="mt-[10px] truncate font-['Syne'] text-[24px] font-extrabold leading-[1.1] text-(--text)">
            {thread.title}
          </h1>

          <div className="mt-[12px] flex flex-wrap items-center gap-[8px] text-[12px] text-muted">
            <div className="flex items-center gap-[8px]">
              <div className="h-[32px] w-[32px] overflow-hidden rounded-full bg-(--blue-light)" />
              <div className="flex flex-col">
                <span className="font-(--font-dm-sans) text-[13px] text-(--text)">
                  {thread.author.name ?? 'Unknown'}
                </span>
                <TimeAgo date={thread.createdAt} />
              </div>
            </div>

            <span className="mx-[8px] h-[16px] w-px bg-border" />

            <div className="flex items-center gap-[12px] text-[11px] font-medium text-muted">
              <span>{thread._count.messages} messages</span>
              <span>·</span>
              <span>{thread._count.members} participants</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-[12px]">
          <div className="inline-flex items-center gap-[8px] rounded-[999px] border border-border bg-(--bg) px-[10px] py-[4px]">
            <span className={`h-[8px] w-[8px] rounded-full ${resolution.colorClass}`} />
            <span className="font-(--font-dm-mono) text-[10px] uppercase tracking-[0.12em] text-muted">
              {resolution.label}
            </span>
          </div>

          <BookmarkButton
            threadId={thread.id}
            className="h-[32px] rounded-[6px] border border-border bg-(--blue-dim) px-[10px] text-[12px] font-medium text-(--text)"
          />
        </div>
      </div>
    </header>
  );
}
