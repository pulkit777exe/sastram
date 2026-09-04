/**
 * The canonical cost tier of every AI call path. Every gate (route pre-flight,
 * worker spend-cap, @sai enqueue) reads from here rather than deriving cost
 * ad hoc. Pure and side-effect free.
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

export const CHEAP_PATHS: readonly AiCallPath[] = [
  AiCallPath.TEXT_TOXICITY_MODERATION,
  AiCallPath.IMAGE_MODERATION,
  AiCallPath.FORUM_SEARCH_CLASSIFY,
  AiCallPath.FORUM_SEARCH_CROSS_REFERENCE,
  AiCallPath.THREAD_DNA,
  AiCallPath.RESOLUTION_SCORE,
  AiCallPath.CONFLICT_DETECTION,
];

export const EXPENSIVE_PATHS: readonly AiCallPath[] = [
  AiCallPath.FORUM_SEARCH_SYNTHESIZE,
  AiCallPath.AI_INLINE_REPLY,
  AiCallPath.AI_REPLY_STREAM,
  AiCallPath.THREAD_SUMMARY,
  AiCallPath.DAILY_DIGEST,
  AiCallPath.QUERY_WARMING,
];

// Pre-flight guesses only — ai-spend-cap.ts holds the authoritative token count.
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

const DEFAULT_ESTIMATED_COST_USD = 0.01;

const CACHEABLE_PATHS = new Set<AiCallPath>(CHEAP_PATHS);

/** Unknown paths fall through to EXPENSIVE — never fail open on cost. */
export function classifyAiCallCost(path: AiCallPath): AiCostClassification {
  // Determine tier explicitly.
  const isCheap = CHEAP_PATHS.includes(path);
  let tier: AiCostTier;
  if (isCheap) {
    tier = AiCostTier.CHEAP;
  } else {
    tier = AiCostTier.EXPENSIVE;
  }

  // Look up estimated cost with explicit fallback.
  let estimatedCostUsd: number;
  const knownCost = ESTIMATED_COST_USD[path];
  if (knownCost !== undefined) {
    estimatedCostUsd = knownCost;
  } else {
    // Unknown path — default to expensive default cost.
    estimatedCostUsd = DEFAULT_ESTIMATED_COST_USD;
  }

  const cacheable = CACHEABLE_PATHS.has(path);

  return {
    tier,
    estimatedCostUsd,
    cacheable,
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
 * Cheap paths never consult the spend cap — their cost is bounded and cacheable,
 * and this is what keeps moderation running once the $5 cap is hit. Expensive
 * paths need a passing pre-flight so we don't enqueue work we can't afford.
 */
export function evaluateAiCostGate(input: AiCostGateInput): AiCostGateResult {
  const classification = classifyAiCallCost(input.path);
  const isCheap = classification.tier === AiCostTier.CHEAP;

  // Cheap paths are always allowed.
  if (isCheap) {
    return { allowed: true, reason: 'none' };
  }

  // Expensive paths require spend cap to be allowed.
  if (!input.spendCapAllowed) {
    return { allowed: false, reason: 'spend_cap_reached' };
  }

  // Expensive but cap not reached — allowed.
  return { allowed: true, reason: 'none' };
}
