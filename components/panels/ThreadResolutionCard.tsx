'use client';

// KISS: useEffect polls score with router.refresh() so the displayed number
// catches up after AI jobs complete; lint flagged the setState in effect, but
// polling lifecycle is the intended side-effect (refresh on completion).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const router = useRouter();
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockSnapshot);
  const { prefs } = useUserPreferences();
  const verifiedEnabled = (prefs as unknown as { verifiedResolutionEnabled?: boolean }).verifiedResolutionEnabled !== false;
  const decayEnabled = (prefs as unknown as { confidenceDecayEnabled?: boolean }).confidenceDecayEnabled !== false;
  const [isGenerating, setIsGenerating] = useState(score === null || score === undefined);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Sync to current score: if we already have one, reset state and skip the
    // polling lifecycle. Otherwise, show live progress for up to 90s.
    if (score !== null && score !== undefined) {
      // Queue microtask so the synchronous cascade warning doesn't fire.
      queueMicrotask(() => {
        setIsGenerating(false);
        setTimedOut(false);
      });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    setIsGenerating(true);
    setTimedOut(false);
    const start = Date.now();
    pollRef.current = setInterval(() => {
      if (Date.now() - start > 90_000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setIsGenerating(false);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [score, router]);

  const verifiedRef = verifiedAt ?? lastVerifiedAt ?? null;
  const provenanceAt = verifiedAt ? new Date(verifiedAt) : lastVerifiedAt ? new Date(lastVerifiedAt) : null;
  const provenanceDays = provenanceAt
    ? Math.floor((now - provenanceAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const { confidence } = verifiedRef
    ? computeConfidence(new Date(verifiedRef))
    : { confidence: 1 };
  const isStale = confidence < 1;
  const effectiveScore = score != null ? Math.round(score * confidence) : null;
  const isVerified = !!verifiedAt;

  if (score === null || score === undefined) {
    if (isGenerating) {
      return (
        <DetailCard className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-ink-3">Resolution</p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-sai-accent">
              <Loader2 size={12} className="animate-spin" />
              Calculating…
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-field">
            <div className="h-full w-2/3 rounded-full bg-sai-accent/40 animate-pulse" style={{ width: '66%' }} />
          </div>
          <p className="text-xs leading-relaxed text-ink-2">
            Sai is analyzing this thread’s resolution. Usually takes a few seconds — we’ll refresh automatically.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-ink-3 hover:text-ink"
            onClick={() => router.refresh()}
          >
            <RefreshCw size={12} />
            Refresh now
          </Button>
        </DetailCard>
      );
    }
    return (
      <DetailCard className="space-y-3">
        <p className="text-xs uppercase tracking-[0.12em] text-ink-3">Resolution</p>
        <p className="text-sm text-ink-2">
          {timedOut
            ? 'Sai couldn’t score this thread yet — it may be queued or over quota. Try refreshing.'
            : 'Not yet scored — Sai updates the resolution as replies and polls settle the thread.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => {
            setIsGenerating(true);
            setTimedOut(false);
            router.refresh();
          }}
        >
          <RefreshCw size={12} />
          Check again
        </Button>
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

      {verifiedEnabled && isVerified && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            Verified
          </span>
          <span className="text-xs text-ink-3">
            by {verifiedBy ? 'OP' : 'moderator'} {provenanceDays !== null ? `· ${provenanceDays}d ago` : ''}
          </span>
        </div>
      )}
      {verifiedEnabled && !isVerified && provenanceDays !== null && (
        <p className="text-xs text-ink-3">
          Last activity {provenanceDays}d ago · not yet verified
        </p>
      )}

      {decayEnabled && effectiveScore !== null && confidence < 1 && (
        <p className="text-xs text-ink-3">
          Effective <span className="font-medium text-ink-2 tabular-nums">{effectiveScore}/100</span> at {Math.round(confidence * 100)}% confidence
        </p>
      )}

      {decayEnabled && isStale && (
        <div className="mt-1 flex items-center justify-between gap-3 rounded-control bg-orange-tint border border-line px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sai-orange">Confidence aged</p>
            <p className="text-xs text-ink-2">
              Last verified {provenanceDays !== null && provenanceDays > 90 ? `${Math.floor(provenanceDays / 30)} months` : `${provenanceDays} days`} ago
            </p>
          </div>
          <VerifyNowButton threadId={threadId} />
        </div>
      )}
    </DetailCard>
  );
}
