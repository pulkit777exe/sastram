import { logger } from '@/lib/infrastructure/logger';
import { threadDnaSchema, type ThreadDNA } from '@/lib/schemas/thread-dna';
import type { MessageInput } from './types';
import { DEFAULT_THREAD_DNA, DEFAULT_CONFLICT, type ConflictResult } from './types';

export const MAX_CONTENT_CHARS = 12_000; // approx 3k tokens — fits single Gemini flash call
export const AI_TIMEOUT_MS = 15_000; // per-request abort — matches withRetry timeout
const STREAM_STALL_MS = 30_000; // gap with no chunk means provider stalled
const STREAM_TOTAL_MS = 90_000; // hard cap for entire streaming response

export function buildMessageContent(messages: MessageInput[]): string {
  const formattedMessages = messages.map((message) => {
    let timestampPrefix = '';
    if (message.createdAt !== undefined && message.createdAt !== null) {
      timestampPrefix = `[${new Date(message.createdAt).toISOString()}] `;
    }
    let replyIndent = '';
    if (message.depth !== undefined && message.depth !== null && message.depth > 0) {
      replyIndent = '  (reply) ';
    }
    const senderName = message.sender?.name ?? 'Unknown';
    return `${timestampPrefix}${replyIndent}${senderName}: ${message.content}`;
  });
  return formattedMessages.join('\n').substring(0, MAX_CONTENT_CHARS);
}

export function buildIndexedContent(messages: MessageInput[]): string {
  const indexedMessages = messages.map((message, index) => {
    const senderName = message.sender?.name ?? 'Unknown';
    const messageNumber = index + 1;
    return `${messageNumber}. ${senderName}: ${message.content}`;
  });
  return indexedMessages.join('\n').substring(0, MAX_CONTENT_CHARS);
}

const JSON_FENCE = '```json';
const CODE_FENCE = '```';
const HTML_FENCE = '```html';

export function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith(JSON_FENCE)) {
    cleaned = cleaned.slice(JSON_FENCE.length);
  }
  if (cleaned.startsWith(CODE_FENCE)) {
    cleaned = cleaned.slice(CODE_FENCE.length);
  }
  cleaned = cleaned.trim();
  if (cleaned.endsWith(CODE_FENCE)) {
    cleaned = cleaned.slice(0, -CODE_FENCE.length);
  }
  return cleaned.trim();
}

export function stripHtmlFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith(HTML_FENCE)) {
    cleaned = cleaned.slice(HTML_FENCE.length);
  }
  if (cleaned.startsWith(CODE_FENCE)) {
    cleaned = cleaned.slice(CODE_FENCE.length);
  }
  cleaned = cleaned.trim();
  if (cleaned.endsWith(CODE_FENCE)) {
    cleaned = cleaned.slice(0, -CODE_FENCE.length);
  }
  return cleaned.trim();
}

function isValidConflictTuple(value: unknown): value is [number, number] {
  if (!Array.isArray(value)) return false;
  if (value.length !== 2) return false;
  if (typeof value[0] !== 'number') return false;
  if (typeof value[1] !== 'number') return false;
  return true;
}

export function parseThreadDNA(responseText: string): ThreadDNA {
  try {
    const cleanedJson = cleanJsonText(responseText);
    const parsedJson = JSON.parse(cleanedJson);
    const validationResult = threadDnaSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      logger.error('[parseThreadDNA] Zod validation failed', {
        error: validationResult.error.flatten(),
      });
      return DEFAULT_THREAD_DNA;
    }
    return validationResult.data;
  } catch (parseError) {
    logger.error('[parseThreadDNA] JSON parse failed', { error: parseError });
    return DEFAULT_THREAD_DNA;
  }
}

export function parseConflict(responseText: string): ConflictResult {
  try {
    const cleanedJson = cleanJsonText(responseText);
    const parsedJson = JSON.parse(cleanedJson) as Record<string, unknown>;
    if (typeof parsedJson.hasConflict !== 'boolean') {
      return DEFAULT_CONFLICT;
    }
    let conflictingMessages: [number, number] | undefined = undefined;
    if (isValidConflictTuple(parsedJson.conflictingMessages)) {
      conflictingMessages = parsedJson.conflictingMessages;
    }
    let reasonText: string | undefined = undefined;
    if (typeof parsedJson.reason === 'string') {
      reasonText = parsedJson.reason;
    }
    return {
      hasConflict: parsedJson.hasConflict,
      conflictingMessages,
      reason: reasonText,
    };
  } catch (parseError) {
    logger.error('[parseConflict] JSON parse failed', { error: parseError });
    return DEFAULT_CONFLICT;
  }
}

const MIN_TOXICITY_SCORE = 0;
const MAX_TOXICITY_SCORE = 1;
const MIN_RESOLUTION_SCORE = 0;
const MAX_RESOLUTION_SCORE = 100;

function clampScore(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseToxicity(responseText: string): number {
  const toxicityMatch = responseText.match(/"toxicity"\s*:\s*([0-9.]+)/i);
  if (toxicityMatch === null || toxicityMatch[1] === undefined) return 0;
  const parsedScore = parseFloat(toxicityMatch[1]);
  if (isNaN(parsedScore)) return 0;
  return clampScore(parsedScore, MIN_TOXICITY_SCORE, MAX_TOXICITY_SCORE);
}

export function parseResolutionScore(responseText: string): number | null {
  const trimmedText = responseText.trim();
  const plainScore = parseInt(trimmedText, 10);
  if (!isNaN(plainScore)) {
    return clampScore(plainScore, MIN_RESOLUTION_SCORE, MAX_RESOLUTION_SCORE);
  }

  try {
    const cleaned = cleanJsonText(responseText);
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed === 'number' && !isNaN(parsed)) {
      return clampScore(parsed, MIN_RESOLUTION_SCORE, MAX_RESOLUTION_SCORE);
    }
    if (parsed !== null && typeof parsed === 'object' && 'score' in parsed) {
      const scoreValue = (parsed as { score: unknown }).score;
      if (typeof scoreValue === 'number' && !isNaN(scoreValue)) {
        return clampScore(scoreValue, MIN_RESOLUTION_SCORE, MAX_RESOLUTION_SCORE);
      }
      if (typeof scoreValue === 'string') {
        const parsedFromString = parseInt(scoreValue, 10);
        if (!isNaN(parsedFromString)) {
          return clampScore(parsedFromString, MIN_RESOLUTION_SCORE, MAX_RESOLUTION_SCORE);
        }
      }
    }
  } catch {
    // not JSON, fall through to number search
  }

  const simpleMatch = responseText.match(/(\d{1,3})/);
  if (simpleMatch !== null && simpleMatch[1] !== undefined) {
    const extractedScore = parseInt(simpleMatch[1], 10);
    if (!isNaN(extractedScore)) {
      return clampScore(extractedScore, MIN_RESOLUTION_SCORE, MAX_RESOLUTION_SCORE);
    }
  }

  logger.warn('[parseResolutionScore] Non-integer response from AI — treating as unavailable', { text: responseText.slice(0, 200) });
  return null;
}

export function makeAbortController(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export function makeStreamAbortController() {
  const controller = new AbortController();
  let stallTimer = setTimeout(() => controller.abort(), STREAM_STALL_MS);
  const totalTimer = setTimeout(() => controller.abort(), STREAM_TOTAL_MS);

  return {
    signal: controller.signal,
    resetStall: () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(), STREAM_STALL_MS);
    },
    clear: () => {
      clearTimeout(stallTimer);
      clearTimeout(totalTimer);
    },
  };
}
