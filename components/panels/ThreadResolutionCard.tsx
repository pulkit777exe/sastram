'use client';

import { useSyncExternalStore } from 'react';
import { VerifyNowButton } from '@/components/thread/verify-now-button';
import { computeConfidence } from '@/modules/threads/confidence-decay';
import { DetailCard } from '@/components/ui/detail-card';
import { useUserPreferences } from '@/hooks/use-user-preferences';

interface ThreadResolutionCardProps {
  threadId: string;
  score: number | null | undefined;
  lastVerifiedAt: Date | string | null;
  verifiedAt?: Date | string | null;
  verifiedBy?: string | null;
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

function getLabel(score: number): string {
  if (score >= 70) {
    return 'Settled';
  }
  if (score >= 40) {
    return 'In progress';
  }
  return 'Open';
}

function getBarClass(score: number): string {
  if (score >= 70) {
    return 'bg-sai-green';
  }
  if (score >= 40) {
    return 'bg-sai-orange';
  }
  return 'bg-sai-red';
}

export default function ThreadResolutionCard({
  threadId,
  score,
  lastVerifiedAt,
  verifiedAt,
  verifiedBy,
}: ThreadResolutionCardProps) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockSnapshot);
  const { prefs } = useUserPreferences();
  const showVerified = (prefs as unknown as { verifiedResolutionEnabled?: boolean }).verifiedResolutionEnabled !== false;
  const showDecay = (prefs as unknown as { confidenceDecayEnabled?: boolean }).confidenceDecayEnabled !== false;

  const verifiedRef = verifiedAt ?? lastVerifiedAt ?? null;
  const provenanceAt = verifiedAt ? new Date(verifiedAt) : lastVerifiedAt ? new Date(lastVerifiedAt) : null;
  const provenanceDays = provenanceAt
    ? Math.floor((now - provenanceAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const { confidence } = showDecay && verifiedRef
    ? computeConfidence(new Date(verifiedRef))
    : { confidence: 1 };
  const isStale = showDecay && confidence < 1;
  const effectiveScore = showDecay && score != null ? Math.round(score * confidence) : null;

  if (score === null || score === undefined) {
    return (
      <DetailCard className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] text-ink-3">Resolution</p>
        <p className="text-sm text-ink-2">
          Not yet scored — Sai updates the resolution as replies and polls settle the thread.
        </p>
      </DetailCard>
    );
  }

  const label = getLabel(score);
  const barClass = getBarClass(score);

  return (
    <DetailCard className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-ink-3">Resolution</p>
          <p className="mt-0.5 text-xs text-ink-2">{label}</p>
        </div>
        <span className="text-2xl leading-none font-bold tabular-nums text-ink">
          {Math.round(score)}
          <span className="text-sm text-ink-3 font-medium">/100</span>
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-field">
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClass}`} style={{ width: `${score}%` }} />
      </div>

      {showDecay && effectiveScore !== null && confidence < 1 && (
        <p className="text-xs text-ink-3">
          Effective <span className="font-medium text-ink-2 tabular-nums">{effectiveScore}/100</span> at {Math.round(confidence * 100)}% confidence
        </p>
      )}

      {showVerified && verifiedAt && (
        <p className="text-xs text-ink-3">
          Verified by {verifiedBy ? 'OP' : 'moderator'} {provenanceDays !== null ? `${provenanceDays}d ago` : ''}
        </p>
      )}

      {showDecay && isStale && (
        <div className="mt-1 flex items-center justify-between gap-3 rounded-control bg-orange-tint border border-line px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sai-orange">Confidence aged</p>
            <p className="text-xs text-ink-2">
              Last verified {provenanceDays !== null && provenanceDays > 90 ? `${Math.floor(provenanceDays / 30)} months` : `${provenanceDays} days`} ago
            </p>
          </div>
          {showVerified && <VerifyNowButton threadId={threadId} />}
        </div>
      )}
    </DetailCard>
  );
}
