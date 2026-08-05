'use client';

import { useRef, useEffect, useSyncExternalStore } from 'react';
import type { ThreadWithFullContext } from '@/modules/threads';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import { TagChip } from '@/components/thread/tag-chip';

const RESOLVABLE_QUESTION_TYPES = new Set(['factual', 'technical', 'comparison']);

interface ThreadInfoCardProps {
  thread: ThreadWithFullContext;
}

let cachedSnapshot = Date.now();

function subscribeToClock(cb: () => void) {
  const id = setInterval(() => {
    cachedSnapshot = Date.now();
    cb();
  }, 60000);
  return () => clearInterval(id);
}

function getClockSnapshot() {
  return cachedSnapshot;
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

  return <span ref={ref} className="t-digit-group font-['Syne'] text-base font-bold text-foreground" />;
}

export default function ThreadInfoCard({ thread }: ThreadInfoCardProps) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockSnapshot);
  const threadDna = parseThreadDna(thread.threadDna);
  // Resolution UI only applies to Q&A-shaped threads. Discussion-shaped
  // threads (opinion/other) and threads not yet classified show nothing.
  const showResolution = Boolean(
    threadDna && RESOLVABLE_QUESTION_TYPES.has(threadDna.questionType)
  );
  const lastVerifiedRef = thread.lastVerifiedAt ?? thread.updatedAt;
  const lastVerifiedDays = lastVerifiedRef
    ? Math.floor((now - new Date(lastVerifiedRef).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="font-(--font-dm-mono) text-xs uppercase tracking-[0.12em] text-muted-foreground-foreground">
        Thread information
      </p>

      <div className="mt-3 space-y-2 text-sm text-muted-foreground-foreground">
        <div className="flex items-center justify-between">
          <span>Messages</span>
          <DigitGroup value={thread._count.messages} />
        </div>

        {showResolution && (
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs">Resolution</span>
              {thread.resolutionScore !== null ? (
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-15 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-chart-2"
                      style={{ width: `${thread.resolutionScore}%` }}
                    />
                  </div>
                  <DigitGroup value={thread.resolutionScore} />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/70">Not yet resolved</span>
              )}
            </div>
            {thread.resolutionScore !== null && lastVerifiedDays !== null && lastVerifiedDays > 30 && (
              <p className="text-xs text-muted-foreground/60 text-right">
                Confidence aged — last verified {lastVerifiedDays > 90
                  ? `${Math.floor(lastVerifiedDays / 30)} months`
                  : `${lastVerifiedDays} days`} ago
              </p>
            )}
          </div>
        )}
      </div>

      {thread.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {thread.tags.map((tag, index) => (
            <TagChip key={tag.tag.name ?? index} tag={tag.tag} clickable={false} />
          ))}
        </div>
      )}
    </section>
  );
}
