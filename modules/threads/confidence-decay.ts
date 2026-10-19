const CONFIDENCE_HALF_LIFE_DAYS = 90;
const RECENCY_THRESHOLD_DAYS = 30;
const MIN_CONFIDENCE = 0.05;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Provenance confidence below this is considered stale: the resolution score
 * is due for re-verification (human) or re-scoring (AI). The curve crosses
 * 0.5 at RECENCY_THRESHOLD_DAYS + CONFIDENCE_HALF_LIFE_DAYS ≈ 120 days.
 */
export const CONFIDENCE_TRUST_THRESHOLD = 0.5;

/**
 * Computes a confidence factor (0–1) representing how trustworthy a resolution
 * score is based on age. The resolution score itself is NOT decayed — it reflects
 * how resolved the thread is (a permanent property of the discussion). Only our
 * confidence that the score is still accurate decays over time.
 *
 * @param scoreTime - when the current resolution was last established: the AI
 * score's computation (`lastVerifiedAt`) or a human verification (`verifiedAt`)
 * @returns confidence factor (0–1) and age in days
 */
export function computeConfidence(
  scoreTime: Date
): { confidence: number; ageDays: number } {
  const ageMs = Date.now() - scoreTime.getTime();
  const ageDays = Math.max(0, ageMs / MS_PER_DAY);

  if (ageDays < RECENCY_THRESHOLD_DAYS) {
    return { confidence: 1, ageDays };
  }

  const confidence = Math.max(
    MIN_CONFIDENCE,
    Math.pow(0.5, (ageDays - RECENCY_THRESHOLD_DAYS) / CONFIDENCE_HALF_LIFE_DAYS),
  );

  return { confidence, ageDays };
}

/**
 * True while a thread's resolution provenance is still trusted. Provenance is
 * human verification (`verifiedAt`) or the last AI score (`lastVerifiedAt`),
 * preferring the human stamp when both exist; trust decays with
 * {@link computeConfidence}. Staleness and conflict marking never refresh
 * either timestamp — only a real verification or score computation does — so
 * a thread marked outdated is re-enriched instead of being silenced for
 * another full decay window.
 */
export function hasTrustedProvenance(
  verifiedAt: Date | null | undefined,
  lastVerifiedAt: Date | null | undefined
): boolean {
  const provenanceAt = verifiedAt ?? lastVerifiedAt;
  if (!provenanceAt) return false;
  return computeConfidence(provenanceAt).confidence >= CONFIDENCE_TRUST_THRESHOLD;
}
