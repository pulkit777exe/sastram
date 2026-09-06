export type { AIService, MessageInput, ImageModerationResult } from './types';
export { DEFAULT_THREAD_DNA, DEFAULT_CONFLICT } from './types';
export { AI_NOT_CONFIGURED_SENTINEL, isAiNotConfigured } from '@/lib/services/ai-sentinel';

// Re-export classes for direct instantiation in tests
export { GeminiService } from './gemini';
export { OpenAIService } from './openai';
export { NoOpAIService } from './noop';

import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import type { AIService } from './types';
import { GeminiService } from './gemini';
import { OpenAIService } from './openai';
import { NoOpAIService } from './noop';

export function createAiService(): AIService {
  const envConfig = getEnv();
  const provider = envConfig.AI_PROVIDER;
  let key: string | undefined;
  if (provider === 'gemini') {
    key = envConfig.GEMINI_API_KEY;
  } else {
    key = envConfig.OPENAI_API_KEY;
  }

  if (!key) {
    let expectedKeyName = 'OPENAI_API_KEY';
    if (provider === 'gemini') expectedKeyName = 'GEMINI_API_KEY';
    logger.warn(
      `[AI Service] ${expectedKeyName} not set. AI features disabled.`
    );
    return new NoOpAIService();
  }

  logger.info(`[AI Service] Initializing with provider: ${provider}`);
  if (provider === 'gemini') {
    return new GeminiService(key);
  }
  return new OpenAIService(key);
}

export const aiService: AIService = createAiService();
