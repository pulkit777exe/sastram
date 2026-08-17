import { logger } from '@/lib/infrastructure/logger';
import { threadDnaSchema, type ThreadDNA } from '@/lib/schemas/thread-dna';
import type { MessageInput } from './types';
import { DEFAULT_THREAD_DNA, DEFAULT_CONFLICT, type ConflictResult } from './types';

export const MAX_CONTENT_CHARS = 12_000;
export const AI_TIMEOUT_MS = 15_000;
const STREAM_STALL_MS = 30_000;
const STREAM_TOTAL_MS = 90_000;

export function buildMessageContent(messages: MessageInput[]): string {
  return messages
    .map((m) => {
      const ts = m.createdAt ? `[${new Date(m.createdAt).toISOString()}] ` : '';
      const indent = m.depth && m.depth > 0 ? '  (reply) ' : '';
      const name = m.sender?.name ?? 'Unknown';
      return `${ts}${indent}${name}: ${m.content}`;
    })
    .join('\n')
    .substring(0, MAX_CONTENT_CHARS);
}

export function buildIndexedContent(messages: MessageInput[]): string {
  return messages
    .map((m, i) => {
      const name = m.sender?.name ?? 'Unknown';
      return `${i + 1}. ${name}: ${m.content}`;
    })
    .join('\n')
    .substring(0, MAX_CONTENT_CHARS);
}

export function cleanJsonText(text: string): string {
  return text
    .trim()
    .replace(/```json\n?|```\n?/g, '')
    .trim();
}

export function stripHtmlFences(text: string): string {
  return text.replace(/```html\n?/g, '').replace(/```\n?/g, '');
}

export function parseThreadDNA(text: string): ThreadDNA {
  try {
    const parsed = threadDnaSchema.safeParse(JSON.parse(cleanJsonText(text)));
    if (!parsed.success) {
      logger.error('[parseThreadDNA] Zod validation failed', {
        error: parsed.error.flatten(),
      });
      return DEFAULT_THREAD_DNA;
    }
    return parsed.data;
  } catch (err) {
    logger.error('[parseThreadDNA] JSON parse failed', { error: err });
    return DEFAULT_THREAD_DNA;
  }
}

export function parseConflict(text: string): ConflictResult {
  try {
    const parsed = JSON.parse(cleanJsonText(text)) as Record<string, unknown>;
    if (typeof parsed.hasConflict !== 'boolean') {
      return DEFAULT_CONFLICT;
    }
    return {
      hasConflict: parsed.hasConflict,
      conflictingMessages: Array.isArray(parsed.conflictingMessages) &&
        parsed.conflictingMessages.length === 2 &&
        typeof parsed.conflictingMessages[0] === 'number' &&
        typeof parsed.conflictingMessages[1] === 'number'
        ? [parsed.conflictingMessages[0], parsed.conflictingMessages[1]]
        : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch (err) {
    logger.error('[parseConflict] JSON parse failed', { error: err });
    return DEFAULT_CONFLICT;
  }
}

export function parseToxicity(text: string): number {
  const match = text.match(/"toxicity"\s*:\s*([0-9.]+)/i);
  return match ? Math.min(1, Math.max(0, parseFloat(match[1]))) : 0;
}

export function parseResolutionScore(text: string): number | null {
  const plain = parseInt(text.trim(), 10);
  if (!isNaN(plain)) {
    return Math.max(0, Math.min(100, plain));
  }

  const match = text.match(/(?: score|"score"|score:\s*)(\d{1,3})\b/i);
  if (match) {
    const score = parseInt(match[1], 10);
    if (!isNaN(score)) {
      return Math.max(0, Math.min(100, score));
    }
  }

  logger.warn('[parseResolutionScore] Non-integer response from AI — treating as unavailable', { text: text.slice(0, 200) });
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
