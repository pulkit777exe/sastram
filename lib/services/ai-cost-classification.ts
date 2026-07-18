/**
 * AI cost classification — the canonical cost tier of every AI call path.
 *
 * This module is the promoted core-infra seam: every AI gate (route pre-flight,
 * worker spend-cap, @sai enqueue) reads classification from here instead of
 * re-deriving cost ad hoc. The goal of Phase 3 is to move from a soft per-user
 * quota (3/day) to a hard, cost-aware classification of
 * cheap-and-always-on vs expensive-and-deliberate.
 *
 * Pure and side-effect free — fully unit testable with no Redis/network.
 */

export enum AiCostTier {
  CHEAP = 'cheap',
  EXPENSIVE = 'expensive',
}

export enum AiCallPath {
  // --- cheap-and-always-on (classification / scoring, sub-cent, cacheable) ---
  TEXT_TOXICITY_MODERATION = 'text_toxicity_moderation',
  IMAGE_MODERATION = 'image_moderation',
  FORUM_SEARCH_CLASSIFY = 'forum_search_classify',
  FORUM_SEARCH_CROSS_REFERENCE = 'forum_search_cross_reference',
  THREAD_DNA = 'thread_dna',
  RESOLUTION_SCORE = 'resolution_score',
  CONFLICT_DETECTION = 'conflict_detection',

  // --- expensive-and-deliberate (synthesis, multi-source search) ---
  FORUM_SEARCH_SYNTHESIZE = 'forum_search_synthesize',
  AI_INLINE_REPLY = 'ai_inline_reply',
  AI_REPLY_STREAM = 'ai_reply_stream',
  THREAD_SUMMARY = 'thread_summary',
  DAILY_DIGEST = 'daily_digest',
  QUERY_WARMING = 'query_warming',
}

export interface AiCostClassification {
  tier: AiCostTier;
  estimatedCostUsd: number;
  cacheable: boolean;
}

/** Paths that are cheap, sub-cent, and cacheable (always allowed when under quota). */
export const CHEAP_PATHS: readonly AiCallPath[] = [
  AiCallPath.TEXT_TOXICITY_MODERATION,
  AiCallPath.IMAGE_MODERATION,
  AiCallPath.FORUM_SEARCH_CLASSIFY,
  AiCallPath.FORUM_SEARCH_CROSS_REFERENCE,
  AiCallPath.THREAD_DNA,
  AiCallPath.RESOLUTION_SCORE,
  AiCallPath.CONFLICT_DETECTION,
];

/** Paths that are expensive synthesis / multi-source search — deliberate, hard-gated. */
export const EXPENSIVE_PATHS: readonly AiCallPath[] = [
  AiCallPath.FORUM_SEARCH_SYNTHESIZE,
  AiCallPath.AI_INLINE_REPLY,
  AiCallPath.AI_REPLY_STREAM,
  AiCallPath.THREAD_SUMMARY,
  AiCallPath.DAILY_DIGEST,
  AiCallPath.QUERY_WARMING,
];

// Conservative per-call cost estimates (USD). Used only for spend-cap pre-flight
// guesses; the authoritative counter is ai-spend-cap.ts (token-based).
const ESTIMATED_COST_USD: Record<AiCallPath, number> = {
  [AiCallPath.TEXT_TOXICITY_MODERATION]: 0.0002,
  [AiCallPath.IMAGE_MODERATION]: 0.0004,
  [AiCallPath.FORUM_SEARCH_CLASSIFY]: 0.0003,
  [AiCallPath.FORUM_SEARCH_CROSS_REFERENCE]: 0.0003,
  [AiCallPath.THREAD_DNA]: 0.002,
  [AiCallPath.RESOLUTION_SCORE]: 0.002,
  [AiCallPath.CONFLICT_DETECTION]: 0.002,
  [AiCallPath.FORUM_SEARCH_SYNTHESIZE]: 0.01,
  [AiCallPath.AI_INLINE_REPLY]: 0.008,
  [AiCallPath.AI_REPLY_STREAM]: 0.008,
  [AiCallPath.THREAD_SUMMARY]: 0.012,
  [AiCallPath.DAILY_DIGEST]: 0.015,
  [AiCallPath.QUERY_WARMING]: 0.01,
};

const CACHEABLE_PATHS = new Set<AiCallPath>(CHEAP_PATHS);

/**
 * Classify an AI call path by cost tier.
 *
 * EXPENSIVE is the fail-safe default for unknown paths: never fail open on cost.
 * Only paths explicitly listed in CHEAP_PATHS are treated as cheap.
 */
export function classifyAiCallCost(path: AiCallPath): AiCostClassification {
  const isCheap = CHEAP_PATHS.includes(path);
  return {
    tier: isCheap ? AiCostTier.CHEAP : AiCostTier.EXPENSIVE,
    estimatedCostUsd: ESTIMATED_COST_USD[path] ?? 0.01,
    cacheable: CACHEABLE_PATHS.has(path),
  };
}

export interface AiCostGateInput {
  path: AiCallPath;
  /** Result of a pre-flight spend-cap check. true = cap not reached. */
  spendCapAllowed: boolean;
}

export interface AiCostGateResult {
  allowed: boolean;
  reason?: 'spend_cap_reached' | 'none';
}

/**
 * The hard cost-aware gate.
 *
 * Cheap-and-always-on paths are always allowed (their cost is bounded and
 * cacheable). Expensive-and-deliberate paths require a passing spend-cap
 * pre-flight: we do NOT enqueue unaffordable expensive work that would then
 * burn the LLM. This is the promoted seam that replaces ad-hoc per-path gating.
 *
 * Cheap paths never consult the spend cap, so moderation (which bypasses the
 * $5 cap by design) is unaffected.
 */
export function evaluateAiCostGate(input: AiCostGateInput): AiCostGateResult {
  const classification = classifyAiCallCost(input.path);

  if (classification.tier === AiCostTier.CHEAP) {
    return { allowed: true, reason: 'none' };
  }

  if (!input.spendCapAllowed) {
    return { allowed: false, reason: 'spend_cap_reached' };
  }

  return { allowed: true, reason: 'none' };
}
