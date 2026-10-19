import { GoogleGenAI } from '@google/genai';
import { withRetry } from '@/lib/utils/retry';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import type { ThreadDNA } from '@/lib/schemas/thread-dna';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/ai/prompt-boundary';
import { logAiUsage } from '@/lib/services/ai-usage-logger';
import type { AIService, MessageInput, ImageModerationResult } from './types';
import {
  MAX_CONTENT_CHARS,
  buildMessageContent,
  buildIndexedContent,
  cleanJsonText,
  stripHtmlFences,
  makeStreamAbortController,
  parseThreadDNA,
  parseConflict,
  parseToxicity,
  parseResolutionScore,
} from './helpers';
import { THREAD_DNA_SYSTEM_PROMPT, CONFLICT_SYSTEM_PROMPT } from './prompts';
import { getLangChainService } from '@/lib/services/ai-langchain';

export class GeminiService implements AIService {
  private ai: GoogleGenAI;
  private flashModel: string;
  private proModel: string;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    const env = getEnv();
    this.flashModel = env.GEMINI_FLASH_MODEL;
    this.proModel = env.GEMINI_PRO_MODEL;
  }

  private async generate(
    contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
    operation: string,
    { model = this.flashModel, timeoutMs = 15_000, signal }: { model?: string; timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<string> {
    const start = Date.now();
    // No external timer here: withRetry owns the per-attempt timeout. The
    // caller's signal is passed as the external signal so an abort is
    // immediate, while per-attempt timeouts stay retryable.
    const result = await withRetry(
      (retrySignal) =>
        this.ai.models.generateContent({
          model,
          contents,
          config: { abortSignal: retrySignal },
        }),
      3,
      300,
      timeoutMs,
      signal
    );
    logAiUsage({
      operation,
      provider: 'gemini',
      model,
      inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - start,
    }).catch((e) => logger.warn('[GeminiService] usage log failed', { error: e }));
    return result.text ?? '';
  }

  async generateStreamingResponse(
    promptContent: string,
    onChunk: (chunk: string) => void,
    externalSignal?: AbortSignal
  ): Promise<void> {
    const { signal: stallSignal, resetStall, clear } = makeStreamAbortController();
    const signal = externalSignal ? AbortSignal.any([stallSignal, externalSignal]) : stallSignal;
    try {
      const streamResult = await this.ai.models.generateContentStream({
        model: this.flashModel,
        contents: promptContent,
        config: { abortSignal: signal },
      });
      for await (const streamChunk of streamResult) {
        const chunkText = streamChunk.text;
        if (chunkText !== undefined && chunkText !== null && chunkText.length > 0) {
          onChunk(chunkText);
        }
        resetStall();
      }
    } catch (streamError) {
      let errorDetail: Record<string, unknown>;
      if (streamError instanceof Error) {
        let stackPreview = '';
        if (streamError.stack !== undefined && streamError.stack !== null) {
          stackPreview = streamError.stack.split('\n').slice(0, 3).join(' | ');
        }
        errorDetail = { message: streamError.message, name: streamError.name, stack: stackPreview };
      } else {
        let rawText: string;
        try {
          rawText = JSON.stringify(streamError) ?? String(streamError);
        } catch {
          rawText = String(streamError);
        }
        errorDetail = { raw: rawText };
      }
      logger.error('[GeminiService.generateStreamingResponse]', errorDetail);
      throw streamError;
    } finally {
      clear();
    }
  }

  async generateSummary(content: string, signal?: AbortSignal): Promise<string> {
    const prompt =
      'Summarize this discussion thread. Focus on key points, decisions, and important information. ' +
      'Keep it concise but comprehensive (200-300 words):\n\n' +
      content.substring(0, MAX_CONTENT_CHARS) +
      '\n\nSummary:';

    try {
      return await this.generate(prompt, 'generate-summary', { signal });
    } catch (error) {
      logger.warn('[GeminiService.generateSummary] AI failed, returning fallback', { error });
      return 'Summary unavailable.';
    }
  }

  async generateThreadSummary(messages: MessageInput[], signal?: AbortSignal): Promise<string> {
    try {
      const langchainService = getLangChainService();
      return await langchainService.generateThreadSummary(messages);
    } catch (error) {
      logger.warn('[GeminiService.generateThreadSummary] LangChain failed, falling back to basic', {
        error,
      });
      return this.generateSummary(buildMessageContent(messages), signal);
    }
  }

  async generateThreadDNA(messages: MessageInput[], signal?: AbortSignal): Promise<ThreadDNA> {
    const content = buildMessageContent(messages);
    const prompt = `${THREAD_DNA_SYSTEM_PROMPT}\n\nMessages:\n${content}\n\nJSON:`;

    try {
      return parseThreadDNA(await this.generate(prompt, 'thread-dna', { signal }));
    } catch (error) {
      logger.error('[GeminiService.generateThreadDNA]', { error });
      throw error;
    }
  }

  async calculateResolutionScore(messages: MessageInput[], signal?: AbortSignal): Promise<number | null> {
    const content = buildMessageContent(messages);
    const prompt =
      'Calculate a resolution score (0-100) for this thread. Consider: ' +
      'clear answer/solution present, depth of responses, consensus level, comprehensiveness. ' +
      'Return ONLY a single integer 0-100.\n\nMessages:\n' +
      content +
      '\n\nScore:';

    try {
      return parseResolutionScore(await this.generate(prompt, 'resolution-score', { signal }));
    } catch (error) {
      logger.error('[GeminiService.calculateResolutionScore]', { error });
      throw error;
    }
  }

  async detectConflicts(messages: MessageInput[], signal?: AbortSignal) {
    const content = buildIndexedContent(messages);
    const prompt = `${CONFLICT_SYSTEM_PROMPT}\n\nMessages:\n${content}\n\nJSON:`;

    try {
      return parseConflict(await this.generate(prompt, 'detect-conflicts', { signal }));
    } catch (error) {
      logger.error('[GeminiService.detectConflicts]', { error });
      throw error;
    }
  }

  async generateDailyDigest(messages: MessageInput[], signal?: AbortSignal): Promise<string> {
    const content = buildMessageContent(messages);
    const prompt =
      'Generate a daily digest for this forum thread as clean HTML ' +
      '(no <html>/<body> tags, just content divs). ' +
      'Use <h3> for section headers and <p>/<ul> for content. ' +
      'Sections: Key Discussions, Decisions Made, Open Questions. ' +
      'Professional and concise.\n\nMessages:\n' +
      content;

    try {
      const text = await this.generate(prompt, 'daily-digest', { model: this.proModel, signal });
      return stripHtmlFences(text);
    } catch (error) {
      logger.error('[GeminiService.generateDailyDigest]', { error });
      throw error;
    }
  }

  async classifyToxicity(content: string, signal?: AbortSignal): Promise<number> {
    const prompt =
      'You are a content moderation classifier. Analyze the following text for toxicity. ' +
      'Toxicity includes: hate speech, harassment, threats, slurs, explicit content, ' +
      'personal attacks, and harmful language.' +
      DATA_ONLY_INSTRUCTION + '\n\n' +
      'Return ONLY a JSON object with a single field "toxicity" containing a number between 0 and 1, ' +
      'where 0 means completely safe and 1 means extremely toxic.\n\n' +
      `Text to analyze:\n${wrapUserContent(content.substring(0, MAX_CONTENT_CHARS))}\n\nJSON:`;

    try {
      const text = await this.generate(prompt, 'classify-toxicity', { timeoutMs: 10_000, signal });
      return parseToxicity(text);
    } catch (error) {
      logger.warn('[GeminiService.classifyToxicity] AI failed, returning safe score', { error });
      return 0;
    }
  }

  async moderateImageContent(imageUrl: string, signal?: AbortSignal): Promise<ImageModerationResult> {
    const moderationPrompt =
      'Analyze this image for safety. Classify as SAFE, NSFW, or UNKNOWN. ' +
      'NSFW includes explicit, violent, or disturbing content. ' +
      'Respond with JSON: { "classification": string, "confidence": number (0-1), "reason": string }';

    try {
      const responseText = await this.generate(
        [
          {
            role: 'user',
            parts: [{ text: moderationPrompt }, { fileData: { mimeType: 'image/jpeg', fileUri: imageUrl } }],
          },
        ],
        'moderate-image',
        { signal }
      );

      const parsedResponse = JSON.parse(cleanJsonText(responseText));

      let classification: 'SAFE' | 'NSFW' | 'UNKNOWN' = 'UNKNOWN';
      if (
        parsedResponse.classification === 'SAFE' ||
        parsedResponse.classification === 'NSFW' ||
        parsedResponse.classification === 'UNKNOWN'
      ) {
        classification = parsedResponse.classification;
      }

      let confidence = 0;
      if (typeof parsedResponse.confidence === 'number') {
        confidence = parsedResponse.confidence;
      }

      let reason = 'No reason provided';
      if (typeof parsedResponse.reason === 'string') {
        reason = parsedResponse.reason;
      }

      return { classification, confidence, reason };
    } catch (moderationError) {
      logger.warn('[GeminiService.moderateImageContent] AI failed, returning UNKNOWN', { error: moderationError });
      return { classification: 'UNKNOWN', confidence: 0, reason: 'Image moderation unavailable' };
    }
  }
}
