const CONFIDENCE_HALF_LIFE_DAYS = 90;
const RECENCY_THRESHOLD_DAYS = 30;
const MIN_CONFIDENCE_SCORE = 5;

export function applyConfidenceDecay(
  rawScore: number,
  updatedAt: Date
): { decayedScore: number; ageDays: number } {
  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));

  if (ageDays < RECENCY_THRESHOLD_DAYS) {
    return { decayedScore: Math.round(rawScore), ageDays };
  }

  const decayFactor = Math.pow(0.5, ageDays / CONFIDENCE_HALF_LIFE_DAYS);
  const decayedScore = Math.round(rawScore * decayFactor);

  return {
    decayedScore: Math.max(MIN_CONFIDENCE_SCORE, decayedScore),
    ageDays,
  };
}
