export type { AIService, MessageInput, ImageModerationResult } from './types';
export { DEFAULT_THREAD_DNA, DEFAULT_CONFLICT } from './types';
export { AI_NOT_CONFIGURED_SENTINEL, isAiNotConfigured } from '@/lib/services/ai-sentinel';

// Re-export classes for direct instantiation in tests
export { GeminiService } from './gemini';
export { OpenAIService } from './openai';
export { NoOpAIService } from './noop';

import type { AIService } from './types';
import { createAiService } from './factory';

export const aiService: AIService = createAiService();
