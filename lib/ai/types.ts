import { z } from 'zod';
import { threadDnaSchema, type ThreadDNA } from '@/lib/schemas/thread-dna';

export type { ThreadDNA } from '@/lib/schemas/thread-dna';

export interface MessageInput {
  content: string;
  sender?: { name: string | null } | null;
  createdAt?: Date | string;
  depth?: number;
}

export const conflictSchema = z.object({
  hasConflict: z.boolean(),
  conflictingMessages: z.tuple([z.number(), z.number()]).optional(),
  reason: z.string().optional(),
});

export type ConflictResult = z.infer<typeof conflictSchema>;

export const DEFAULT_THREAD_DNA: ThreadDNA = {
  questionType: 'other',
  expertiseLevel: 'intermediate',
  topics: ['general discussion'],
  readTimeMinutes: 1,
};

export const DEFAULT_CONFLICT: ConflictResult = { hasConflict: false };

export const MAX_CONTENT_CHARS = 12_000;
export const AI_TIMEOUT_MS = 15_000;

export const THREAD_DNA_SYSTEM_PROMPT =
  'You are a helpful assistant that analyzes discussion threads. ' +
  'Return ONLY valid JSON with no markdown fences. Fields: ' +
  "questionType (one of 'factual','opinion','technical','comparison','other'), " +
  "expertiseLevel (one of 'beginner','intermediate','advanced','expert'), " +
  'topics (array of 1-5 key topics as short strings), ' +
  'readTimeMinutes (integer estimated reading time).';

export const CONFLICT_SYSTEM_PROMPT =
  'You are a helpful assistant that detects conflicts in discussions. ' +
  'A conflict is when two messages present contradictory facts that cannot both be true. ' +
  'Return ONLY valid JSON with no markdown fences. Fields: ' +
  'hasConflict (boolean), ' +
  'conflictingMessages (optional tuple of exactly two message numbers), ' +
  'reason (optional string explaining the conflict).';

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

// Models wrap HTML output in fences despite being told not to.
export function stripHtmlFences(text: string): string {
  return text.replace(/```html\n?/g, '').replace(/```\n?/g, '');
}

export function parseThreadDNA(text: string): ThreadDNA {
  try {
    const parsed = threadDnaSchema.safeParse(JSON.parse(cleanJsonText(text)));
    if (!parsed.success) {
      return DEFAULT_THREAD_DNA;
    }
    return parsed.data;
  } catch {
    return DEFAULT_THREAD_DNA;
  }
}

export function parseConflict(text: string): ConflictResult {
  try {
    const parsed = conflictSchema.safeParse(JSON.parse(cleanJsonText(text)));
    if (!parsed.success) {
      return DEFAULT_CONFLICT;
    }
    return parsed.data;
  } catch {
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

  return null;
}

export function makeAbortController(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export const STREAM_STALL_MS = 30_000;
export const STREAM_TOTAL_MS = 90_000;

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

export interface ImageModerationResult {
  classification: 'SAFE' | 'NSFW' | 'UNKNOWN';
  confidence: number;
  reason: string;
}

export interface AIService {
  generateSummary(content: string): Promise<string>;
  generateThreadSummary(messages: MessageInput[]): Promise<string>;
  generateDailyDigest(messages: MessageInput[]): Promise<string>;
  generateThreadDNA(messages: MessageInput[]): Promise<ThreadDNA>;
  calculateResolutionScore(messages: MessageInput[]): Promise<number | null>;
  detectConflicts(messages: MessageInput[]): Promise<ConflictResult>;
  generateStreamingResponse(content: string, onChunk: (chunk: string) => void): Promise<void>;
  classifyToxicity(content: string): Promise<number>;
  moderateImageContent(imageUrl: string): Promise<ImageModerationResult>;
}
