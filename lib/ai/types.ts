import type { ThreadDNA } from '@/lib/schemas/thread-dna';

export interface MessageInput {
  content: string;
  sender?: { name: string | null } | null;
  createdAt?: Date | string;
  depth?: number;
}

export interface ImageModerationResult {
  classification: 'SAFE' | 'NSFW' | 'UNKNOWN';
  confidence: number;
  reason: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingMessages?: [number, number];
  reason?: string;
}

export interface AIService {
  generateSummary(content: string, signal?: AbortSignal): Promise<string>;
  generateThreadSummary(messages: MessageInput[], signal?: AbortSignal): Promise<string>;
  generateDailyDigest(messages: MessageInput[], signal?: AbortSignal): Promise<string>;
  generateThreadDNA(messages: MessageInput[], signal?: AbortSignal): Promise<ThreadDNA>;
  calculateResolutionScore(messages: MessageInput[], signal?: AbortSignal): Promise<number | null>;
  detectConflicts(messages: MessageInput[], signal?: AbortSignal): Promise<ConflictResult>;
  generateStreamingResponse(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<void>;
  classifyToxicity(content: string, signal?: AbortSignal): Promise<number>;
  moderateImageContent(imageUrl: string, signal?: AbortSignal): Promise<ImageModerationResult>;
}

export const DEFAULT_THREAD_DNA: ThreadDNA = {
  questionType: 'other',
  expertiseLevel: 'intermediate',
  topics: ['general discussion'],
  readTimeMinutes: 1,
};

export const DEFAULT_CONFLICT: ConflictResult = { hasConflict: false };
