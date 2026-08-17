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

export const DEFAULT_THREAD_DNA: ThreadDNA = {
  questionType: 'other',
  expertiseLevel: 'intermediate',
  topics: ['general discussion'],
  readTimeMinutes: 1,
};

export const DEFAULT_CONFLICT: ConflictResult = { hasConflict: false };
