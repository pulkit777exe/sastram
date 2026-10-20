import { isQuotaError } from '@/lib/utils/errors';

/**
 * User-facing fallback content for an inline @sai reply that could not be
 * generated. Kept provider-agnostic so the SSE route and the queue worker
 * persist the exact same message the client displays.
 */
export const AI_REPLY_FAILURE_CONTENT =
  "Sorry, I couldn't generate a response right now. Please try again later.";

export const AI_REPLY_TIMEOUT_CONTENT =
  'Sai took too long to respond. Please try again.';

const AI_REPLY_QUOTA_CONTENT =
  "I'm temporarily over my AI quota, so I couldn't reply just now. Please try again later.";

const AI_REPLY_AUTH_CONTENT =
  'Sai is not configured correctly: the AI provider rejected the API key. Please update the API key and try again.';

function isSpendCapError(error: Error): boolean {
  return error.message.toLowerCase().includes('spend cap');
}

function isAuthError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('api key not valid') ||
    message.includes('invalid api key') ||
    message.includes('unauthenticated') ||
    message.includes('access_token_type_unsupported') ||
    message.includes('401')
  );
}

export function buildAiReplyFailureContent(error?: unknown, timedOut = false): string {
  if (timedOut) return AI_REPLY_TIMEOUT_CONTENT;
  if (!(error instanceof Error)) return AI_REPLY_FAILURE_CONTENT;
  if (isQuotaError(error) || isSpendCapError(error)) return AI_REPLY_QUOTA_CONTENT;
  if (isAuthError(error)) return AI_REPLY_AUTH_CONTENT;
  return AI_REPLY_FAILURE_CONTENT;
}
