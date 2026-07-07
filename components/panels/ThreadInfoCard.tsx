'use client';

import { useRef, useEffect, useSyncExternalStore } from 'react';
import type { ThreadWithFullContext } from '@/modules/threads';
import { TagChip } from '@/components/thread/tag-chip';

interface ThreadInfoCardProps {
  thread: ThreadWithFullContext;
}

function subscribeToClock(cb: () => void) {
  const id = setInterval(cb, 60000);
  return () => clearInterval(id);
}

function getClockSnapshot() {
  return Date.now();
}

function DigitGroup({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chars = String(value).split('');
    el.innerHTML = '';
    chars.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 't-digit';
      span.textContent = ch;
      if (i === chars.length - 2) span.dataset.stagger = '1';
      else if (i === chars.length - 1) span.dataset.stagger = '2';
      el.appendChild(span);
    });
    el.classList.remove('is-animating');
    void el.offsetHeight;
    el.classList.add('is-animating');
  }, [value]);

  return <span ref={ref} className="t-digit-group font-['Syne'] text-[16px] font-bold text-(--text)" />;
}

export default function ThreadInfoCard({ thread }: ThreadInfoCardProps) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockSnapshot);
  const lastVerifiedRef = thread.lastVerifiedAt ?? thread.updatedAt;
  const lastVerifiedDays = lastVerifiedRef
    ? Math.floor((now - new Date(lastVerifiedRef).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground-foreground">
        Thread information
      </p>

      <div className="mt-[12px] space-y-[8px] text-[13px] text-muted-foreground-foreground">
        <div className="flex items-center justify-between">
          <span>Messages</span>
          <DigitGroup value={thread._count.messages} />
        </div>
        <div className="flex items-center justify-between">
          <span>Participants</span>
          <DigitGroup value={thread._count.members} />
        </div>

        {thread.resolutionScore !== null && (
          <div className="mt-[4px] space-y-[2px]">
            <div className="flex items-center justify-between">
              <span className="text-[12px]">Resolution</span>
              <div className="flex items-center gap-[6px]">
                <div className="h-[4px] w-[60px] overflow-hidden rounded-full bg-(--bg)">
                  <div
                    className="h-full rounded-full bg-(--green)"
                    style={{ width: `${thread.resolutionScore}%` }}
                  />
                </div>
                <DigitGroup value={thread.resolutionScore} />
              </div>
            </div>
            {lastVerifiedDays !== null && lastVerifiedDays > 30 && (
              <p className="text-[10px] text-muted-foreground/60 text-right">
                Confidence aged — last verified {lastVerifiedDays > 90
                  ? `${Math.floor(lastVerifiedDays / 30)} months`
                  : `${lastVerifiedDays} days`} ago
              </p>
            )}
          </div>
        )}
      </div>

      {thread.tags.length > 0 && (
        <div className="mt-[12px] flex flex-wrap gap-[6px]">
          {thread.tags.map((tag, index) => (
            <TagChip key={tag.tag.name ?? index} tag={tag.tag} clickable={false} />
          ))}
        </div>
      )}
    </section>
  );
}
