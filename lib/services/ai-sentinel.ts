/**
 * Sentinel value returned by NoOpAIService when GEMINI_API_KEY / OPENAI_API_KEY
 * is not configured. UI consumers must check for this before rendering AI content.
 */
export const AI_NOT_CONFIGURED_SENTINEL = '__AI_NOT_CONFIGURED__';

/**
 * Returns true if the value is the exact sentinel string produced by NoOpAIService.
 * Exact match only — does not substring/trim check, because the streaming accumulation
 * path (ai.worker.ts:streamAiResponse) writes the sentinel verbatim with no
 * concatenation, trimming, or wrapping.
 */
export function isAiNotConfigured(value: string): boolean {
  return value === AI_NOT_CONFIGURED_SENTINEL;
}
