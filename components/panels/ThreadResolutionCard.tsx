'use client';

import { useSyncExternalStore } from 'react';
import { VerifyNowButton } from '@/components/thread/verify-now-button';
import { computeConfidence } from '@/modules/threads/confidence-decay';
import { DetailCard } from '@/components/ui/detail-card';

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

  const { confidence } = lastVerifiedRef
    ? computeConfidence(new Date(lastVerifiedRef))
    : { confidence: 0 };
  const isStale = confidence < 1;

  if (score === null || score === undefined) {
    return (
      <DetailCard className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Resolution</p>
        <p className="text-sm text-foreground/80">
          Not yet resolved. As the thread reaches conclusions, Sai scores how settled it is.
        </p>
      </DetailCard>
    );
  }

  const label = score >= 70 ? 'Settled' : score >= 40 ? 'In progress' : 'Open';
  const barColor = score >= 70 ? 'var(--chart-2)' : score >= 40 ? 'var(--chart-4)' : 'var(--destructive)';

  return (
    <DetailCard className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Resolution</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">{label}</p>
        </div>
        <span className="text-2xl leading-none font-bold tabular-nums text-foreground">
          {Math.round(score)}
          <span className="text-sm text-muted-foreground font-medium">/100</span>
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${score}%`, background: barColor }}
        />
      </div>

      {isStale && (
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-chart-4/10 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-chart-4">Confidence aged</p>
            <p className="text-xs text-muted-foreground">
              Last verified {lastVerifiedDays !== null && lastVerifiedDays > 90 ? `${Math.floor(lastVerifiedDays / 30)} months` : `${lastVerifiedDays} days`} ago
            </p>
          </div>
          <VerifyNowButton threadId={threadId} />
        </div>
      )}
    </DetailCard>
  );
}
