'use client';

import { useSyncExternalStore } from 'react';
import { VerifyNowButton } from '@/components/thread/verify-now-button';

interface ThreadResolutionCardProps {
  threadId: string;
  score: number | null | undefined;
  lastVerifiedAt: Date | string | null;
}

let cachedSnapshot = Date.now();

function subscribeToClock(cb: () => void) {
  const id = setInterval(() => {
    cachedSnapshot = Date.now();
    cb();
  }, 60_000);
  return () => clearInterval(id);
}

function getClockSnapshot() {
  return cachedSnapshot;
}

export default function ThreadResolutionCard({
  threadId,
  score,
  lastVerifiedAt,
}: ThreadResolutionCardProps) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockSnapshot);

  const lastVerifiedRef = lastVerifiedAt ?? null;
  const lastVerifiedDays = lastVerifiedRef
    ? Math.floor((now - new Date(lastVerifiedRef).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = lastVerifiedDays !== null && lastVerifiedDays > 30;

  if (score === null || score === undefined) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Resolution</p>
        <p className="text-sm text-foreground/80">
          Not yet resolved. As the thread reaches conclusions, Sai scores how settled it is.
        </p>
      </div>
    );
  }

  const label = score >= 70 ? 'Settled' : score >= 40 ? 'In progress' : 'Open';
  const barColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Resolution</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">{label}</p>
        </div>
        <span className="text-[28px] leading-none font-bold tabular-nums text-foreground">
          {Math.round(score)}
          <span className="text-[14px] text-muted-foreground font-medium">/100</span>
        </span>
      </div>

      <div className="h-[6px] w-full overflow-hidden rounded-full bg-(--bg)">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${score}%`, background: barColor }}
        />
      </div>

      {isStale && (
        <div className="mt-1 flex items-center justify-between gap-3 rounded-[10px] bg-(--amber)/10 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-(--amber)">Confidence aged</p>
            <p className="text-[10px] text-muted-foreground">
              Last verified {lastVerifiedDays > 90 ? `${Math.floor(lastVerifiedDays / 30)} months` : `${lastVerifiedDays} days`} ago
            </p>
          </div>
          <VerifyNowButton threadId={threadId} />
        </div>
      )}
    </div>
  );
}
