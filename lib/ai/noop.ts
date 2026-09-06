import type { AIService, ImageModerationResult } from './types';
import { DEFAULT_THREAD_DNA, DEFAULT_CONFLICT } from './types';
import { AI_NOT_CONFIGURED_SENTINEL } from '@/lib/services/ai-sentinel';

export class NoOpAIService implements AIService {
  async generateSummary() {
    return AI_NOT_CONFIGURED_SENTINEL;
  }
  async generateThreadSummary() {
    return AI_NOT_CONFIGURED_SENTINEL;
  }
  async generateDailyDigest() {
    return AI_NOT_CONFIGURED_SENTINEL;
  }
  async generateThreadDNA() {
    return DEFAULT_THREAD_DNA;
  }
  async calculateResolutionScore() {
    return null;
  }
  async detectConflicts() {
    return DEFAULT_CONFLICT;
  }
  async generateStreamingResponse(unusedPrompt: string, onChunk: (chunk: string) => void) {
    onChunk(AI_NOT_CONFIGURED_SENTINEL);
  }
  async classifyToxicity() {
    return 0;
  }
  async moderateImageContent(): Promise<ImageModerationResult> {
    return { classification: 'SAFE', confidence: 0, reason: 'AI service not configured' };
  }
}
