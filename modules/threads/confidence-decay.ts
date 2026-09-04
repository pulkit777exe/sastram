const CONFIDENCE_HALF_LIFE_DAYS = 90;
const RECENCY_THRESHOLD_DAYS = 30;
const MIN_CONFIDENCE = 0.05;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes a confidence factor (0–1) representing how trustworthy a resolution
 * score is based on age. The resolution score itself is NOT decayed — it reflects
 * how resolved the thread is (a permanent property of the discussion). Only our
 * confidence that the score is still accurate decays over time.
 *
 * @param scoreTime - when the score was last computed (lastVerifiedAt)
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
