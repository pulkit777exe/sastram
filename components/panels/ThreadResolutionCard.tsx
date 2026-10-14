'use client';

// KISS: while the resolution score is pending, poll a lightweight GET
// endpoint (one JSON row) instead of router.refresh() — the old approach
// re-rendered the entire thread page every 4s just to catch one number.
import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VerifyNowButton } from '@/components/thread/verify-now-button';
import { computeConfidence } from '@/modules/threads/confidence-decay';
import { DetailCard } from '@/components/ui/detail-card';
import { useNow } from '@/components/ui/use-now';
import { useUserPreferences } from '@/hooks/use-user-preferences';

interface ThreadResolutionCardProps {
  threadId: string;
  score: number | null | undefined;
  lastVerifiedAt: Date | string | null;
  verifiedAt?: Date | string | null;
  verifiedBy?: string | null;
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

interface ScoreSnapshot {
  score: number | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  lastVerifiedAt: string | null;
}

async function fetchScoreSnapshot(threadId: string): Promise<ScoreSnapshot | null> {
  try {
    const res = await fetch(`/api/ai/resolution-score?threadId=${encodeURIComponent(threadId)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ScoreSnapshot };
    return json.data ?? null;
  } catch {
    return null;
  }
}

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 90_000;

function hasScore(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

export default function ThreadResolutionCard({
  threadId,
  score,
  lastVerifiedAt,
  verifiedAt,
  verifiedBy,
}: ThreadResolutionCardProps) {
  // Shared 30s tab clock (use-now) — was a per-card 60s interval.
  const now = useNow();
  const { prefs } = useUserPreferences();
  const verifiedEnabled = (prefs as unknown as { verifiedResolutionEnabled?: boolean }).verifiedResolutionEnabled !== false;
  const decayEnabled = (prefs as unknown as { confidenceDecayEnabled?: boolean }).confidenceDecayEnabled !== false;
  // Live values picked up by the poll; server props win until a poll lands.
  const [live, setLive] = useState<ScoreSnapshot | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const currentScore = hasScore(score) ? score : live?.score ?? null;

  useEffect(() => {
    if (currentScore !== null) return; // already have a score — nothing to poll for
    let cancelled = false;
    let elapsed = 0;
    const id = setInterval(async () => {
      // Background tabs neither fetch nor burn the timeout budget.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      elapsed += POLL_INTERVAL_MS;
      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(id);
        if (!cancelled) setTimedOut(true);
        return;
      }
      const snapshot = await fetchScoreSnapshot(threadId);
      if (cancelled) return;
      if (snapshot && hasScore(snapshot.score)) {
        clearInterval(id);
        setLive(snapshot);
        setTimedOut(false);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentScore, threadId]);

  // Manual check — targeted fetch, no page refresh.
  async function handleCheckAgain() {
    setTimedOut(false);
    const snapshot = await fetchScoreSnapshot(threadId);
    if (snapshot && hasScore(snapshot.score)) {
      setLive(snapshot);
    } else {
      setTimedOut(true);
    }
  }

  const currentVerifiedAt = verifiedAt ?? live?.verifiedAt ?? null;
  const currentVerifiedBy = verifiedBy ?? live?.verifiedBy ?? null;
  const currentLastVerifiedAt = lastVerifiedAt ?? live?.lastVerifiedAt ?? null;

  const verifiedRef = currentVerifiedAt ?? currentLastVerifiedAt ?? null;
  const provenanceAt = currentVerifiedAt ? new Date(currentVerifiedAt) : currentLastVerifiedAt ? new Date(currentLastVerifiedAt) : null;
  const provenanceDays = provenanceAt
    ? Math.floor((now - provenanceAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const { confidence } = verifiedRef
    ? computeConfidence(new Date(verifiedRef))
    : { confidence: 1 };
  const isStale = confidence < 1;
  const effectiveScore = currentScore != null ? Math.round(currentScore * confidence) : null;
  const isVerified = !!currentVerifiedAt;

  if (currentScore === null) {
    if (!timedOut) {
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
            Sai is analyzing this thread’s resolution. Usually takes a few seconds — we’ll update automatically.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-ink-3 hover:text-ink"
            onClick={() => void handleCheckAgain()}
          >
            <RefreshCw size={12} />
            Check now
          </Button>
        </DetailCard>
      );
    }
    return (
      <DetailCard className="space-y-3">
        <p className="text-xs uppercase tracking-[0.12em] text-ink-3">Resolution</p>
        <p className="text-sm text-ink-2">
          Sai couldn’t score this thread yet — it may be queued or over quota. Try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => void handleCheckAgain()}
        >
          <RefreshCw size={12} />
          Check again
        </Button>
      </DetailCard>
    );
  }

  const label = getLabel(currentScore);
  const barClass = getBarClass(currentScore);

  return (
    <DetailCard className="space-y-3">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-control bg-brand/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-brand"><path d="M12 2l3.09 6.26L22 9.27l-5 5.14 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-ink-3">Resolution</p>
            <p className="text-xs text-ink-2 font-medium">{label}</p>
          </div>
        </div>
        <span className="text-2xl leading-none font-bold tabular-nums text-ink">
          {Math.round(currentScore)}
          <span className="text-sm text-ink-3 font-medium">/100</span>
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-field">
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClass}`} style={{ width: `${currentScore}%` }} />
      </div>

      {verifiedEnabled && isVerified && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            Verified
          </span>
          <span className="text-xs text-ink-3">
            by {currentVerifiedBy ? 'OP' : 'moderator'} {provenanceDays !== null ? `· ${provenanceDays}d ago` : ''}
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
