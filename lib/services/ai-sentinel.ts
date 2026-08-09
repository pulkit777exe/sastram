/**
 * Returned by NoOpAIService when no AI provider key is configured. UI consumers
 * check for it before rendering, so an unconfigured deploy shows a real message
 * instead of a nonsense one.
 */
export const AI_NOT_CONFIGURED_SENTINEL = '__AI_NOT_CONFIGURED__';

// Exact match, deliberately: the streaming path writes the sentinel verbatim,
// so anything with extra text around it is genuine AI output.
export function isAiNotConfigured(value: string): boolean {
  return value === AI_NOT_CONFIGURED_SENTINEL;
}
