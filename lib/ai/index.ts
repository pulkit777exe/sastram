import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import { GeminiService } from './gemini';
import { OpenAIService, NoOpAIService } from './openai';
import type { AIService } from './types';

// Re-export sentinel
export { AI_NOT_CONFIGURED_SENTINEL, isAiNotConfigured } from './sentinel';

// Re-export types and helpers
export type { AIService, MessageInput, ConflictResult, ImageModerationResult } from './types';
export { buildMessageContent, buildIndexedContent, parseToxicity } from './types';

function createAiService(): AIService {
  const envConfig = getEnv();
  const provider = envConfig.AI_PROVIDER;
  const key = provider === 'gemini' ? envConfig.GEMINI_API_KEY : envConfig.OPENAI_API_KEY;

  if (!key) {
    logger.warn(
      `[AI Service] ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} ` +
        `not set. AI features disabled.`
    );
    return new NoOpAIService();
  }

  logger.info(`[AI Service] Initializing with provider: ${provider}`);
  return provider === 'gemini' ? new GeminiService(key) : new OpenAIService(key);
}

export const aiService: AIService = createAiService();
