import { computeConfidence } from '@/modules/threads/confidence-decay';

export type ResolutionClaimSignal = {
  total: number;
  open: number;
  confirmed: number;
  disputed: number;
  contested: number;
};

export type ResolutionExplanationInput = {
  score: number | null | undefined;
  verifiedAt?: Date | string | null;
  verifiedBy?: string | null;
  lastVerifiedAt?: Date | string | null;
  isOutdated?: boolean | null;
  claimSignal?: ResolutionClaimSignal | null;
  now?: Date | number;
};

export type ResolutionExplanationItem = {
  key: string;
  label: string;
  detail: string;
  tone: 'neutral' | 'positive' | 'warning' | 'critical';
};

export type ResolutionExplanation = {
  factors: ResolutionExplanationItem[];
  hints: string[];
  effectiveScore: number | null;
  confidence: number;
  isVerified: boolean;
  isAged: boolean;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatAge(days: number): string {
  if (days >= 90) return `${Math.floor(days / 30)} months`;
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function summarizeClaimSignal(claims: Array<{ status: string }> | null | undefined): ResolutionClaimSignal | null {
  if (!claims || claims.length === 0) return null;
  const signal: ResolutionClaimSignal = { total: claims.length, open: 0, confirmed: 0, disputed: 0, contested: 0 };
  for (const c of claims) {
    const s = String(c.status).toUpperCase();
    if (s === 'CONFIRMED') signal.confirmed += 1;
    else if (s === 'DISPUTED') signal.disputed += 1;
    else if (s === 'CONTESTED') signal.contested += 1;
    else signal.open += 1;
  }
  return signal;
}

export function explainResolution(input: ResolutionExplanationInput): ResolutionExplanation {
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const score = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : null;
  const verifiedAt = toDate(input.verifiedAt);
  const lastVerifiedAt = toDate(input.lastVerifiedAt);
  const provenanceAt = verifiedAt ?? lastVerifiedAt;
  const verifiedRef = verifiedAt ?? lastVerifiedAt;
  const { confidence } = verifiedRef ? computeConfidence(verifiedRef) : { confidence: 1 };
  const isVerified = !!verifiedAt;
  const isAged = confidence < 1;
  const effectiveScore = score != null ? Math.round(score * confidence) : null;
  const factors: ResolutionExplanationItem[] = [];
  const hints: string[] = [];

  if (score == null) {
    factors.push({
      key: 'pending',
      label: 'Score pending',
      detail: 'No AI-estimated resolution score is available yet.',
      tone: 'neutral',
    });
    hints.push('Ask or reply in the thread so Sai can estimate resolution.');
    return { factors, hints, effectiveScore, confidence, isVerified, isAged };
  }

  if (isVerified) {
    const age = provenanceAt ? formatAge(daysSince(provenanceAt, now)) : null;
    factors.push({
      key: 'verification',
      label: 'Human-verified',
      detail: `A participant or moderator verified this thread${age ? ` ${age} ago` : ''}. Verification is separate from the AI-estimated score.`,
      tone: 'positive',
    });
  } else {
    const age = provenanceAt ? formatAge(daysSince(provenanceAt, now)) : null;
    factors.push({
      key: 'verification',
      label: 'Not human-verified',
      detail: age
        ? `This score is AI-estimated (last scored ${age} ago) and has not been human-verified.`
        : 'This score is AI-estimated and has not been human-verified.',
      tone: 'warning',
    });
    hints.push('Use “Verify now” or community review to confirm the answer.');
  }

  if (isAged) {
    factors.push({
      key: 'decay',
      label: 'Confidence aged',
      detail:
        effectiveScore != null
          ? `Effective AI-estimated confidence is ${effectiveScore}/100 at ${Math.round(confidence * 100)}% because the verification/scoring signal is older.`
          : `Confidence has decayed because the verification/scoring signal is older (${Math.round(confidence * 100)}%).`,
      tone: 'warning',
    });
    hints.push('Refresh or re-verify stale threads so confidence reflects current evidence.');
  } else {
    factors.push({
      key: 'freshness',
      label: 'Confidence current',
      detail: 'The AI-estimated confidence signal has not decayed.',
      tone: 'neutral',
    });
  }

  if (input.isOutdated) {
    factors.push({
      key: 'outdated',
      label: 'Marked outdated',
      detail: 'This thread is marked outdated, so its answer may no longer reflect current information.',
      tone: 'critical',
    });
    hints.push('Update or supersede outdated content before relying on it.');
  }

  const cs = input.claimSignal ?? null;
  if (cs && cs.total > 0) {
    if (cs.disputed > 0 || cs.contested > 0) {
      factors.push({
        key: 'claims',
        label: 'Claims contested',
        detail: `${cs.disputed} disputed and ${cs.contested} contested claim${cs.disputed + cs.contested === 1 ? '' : 's'} out of ${cs.total} need community review.`,
        tone: 'critical',
      });
      hints.push('Review disputed or contested claims and add evidence in discussion.');
    } else if (cs.open > 0) {
      factors.push({
        key: 'claims',
        label: 'Claims awaiting review',
        detail: `${cs.confirmed} confirmed, ${cs.open} open claim${cs.open === 1 ? '' : 's'} out of ${cs.total} still need community confirmation or dispute.`,
        tone: 'neutral',
      });
      hints.push('Confirm or dispute open claims to strengthen the answer.');
    } else {
      factors.push({
        key: 'claims',
        label: 'Claims reviewed',
        detail: `All ${cs.total} extracted claim${cs.total === 1 ? '' : 's'} are currently confirmed by community votes.`,
        tone: 'positive',
      });
    }
  }

  return { factors, hints, effectiveScore, confidence, isVerified, isAged };
}
