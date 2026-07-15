'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import type { ThreadWithFullContext } from '@/modules/threads';

interface ParticipantsCardProps {
  thread: ThreadWithFullContext;
}

export default function ParticipantsCard({ thread }: ParticipantsCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  if (!thread.author) return null;

  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        Owner
      </p>

      <div
        ref={rootRef}
        className="t-avatar-group mt-[10px] flex flex-wrap gap-[8px]"
      >
        <div
          className={cn(
            't-avatar inline-flex items-center gap-[6px] rounded-[999px] bg-(--bg) px-[8px] py-[4px]'
          )}
        >
          <div className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-(--blue-dim)">
            <span className="text-[11px] font-medium text-(--blue)">
              {thread.author.name?.slice(0, 1).toUpperCase() ?? 'U'}
            </span>
          </div>
          <span className="text-[12px] text-(--text)">{thread.author.name ?? 'Unknown'}</span>
        </div>
      </div>
    </section>
  );
}
