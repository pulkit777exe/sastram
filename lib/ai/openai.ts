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
  stripHtmlFences,
  makeAbortController,
  makeStreamAbortController,
  parseThreadDNA,
  parseConflict,
  parseToxicity,
  parseResolutionScore,
} from './helpers';
import { THREAD_DNA_SYSTEM_PROMPT, CONFLICT_SYSTEM_PROMPT } from './prompts';
import { getLangChainService } from '@/lib/services/ai-langchain';

export class OpenAIService implements AIService {
  private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly headers: Record<string, string>;
  private readonly model: string;

  constructor(apiKey: string) {
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    this.model = getEnv().OPENAI_MODEL;
  }

  private async callOpenAI(
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
    operation: string = 'openai-call'
  ): Promise<string> {
    const { signal, clear } = makeAbortController();
    const start = Date.now();
    try {
      const data = await withRetry(
        async (retrySignal) => {
          const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
              model: this.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
              ],
              max_tokens: maxTokens,
              temperature: 0.4,
            }),
            signal: retrySignal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`OpenAI ${response.status}: ${errorText}`);
          }

          return response.json();
        },
        3,
        300,
        15_000,
        signal
      );

      const latencyMs = Date.now() - start;
      logAiUsage({
        operation,
        provider: 'openai',
        model: this.model,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        latencyMs,
      }).catch((e) => logger.warn('[OpenAIService] usage log failed', { error: e }));

      return data.choices[0]?.message?.content ?? '';
    } finally {
      clear();
    }
  }

  async generateStreamingResponse(
    content: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const { signal, resetStall, clear } = makeStreamAbortController();

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that answers forum questions ' +
                'in under 200 words, grounded in thread context.',
            },
            { role: 'user', content },
          ],
          stream: true,
          max_tokens: 400,
          temperature: 0.4,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body from OpenAI');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        resetStall();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta?.content;
            if (delta) onChunk(delta);
          } catch {
            // Malformed SSE chunk — skip silently
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }
        : { raw: JSON.stringify(error) ?? String(error) };
      logger.error('[OpenAIService.generateStreamingResponse]', detail);
      throw error;
    } finally {
      clear();
    }
  }

  async generateSummary(content: string): Promise<string> {
    try {
      return await this.callOpenAI(
        'Summarize discussion threads. Focus on key points and decisions (200-300 words).',
        `Summarize:\n\n${content.substring(0, MAX_CONTENT_CHARS)}`,
        500,
        'generate-summary'
      );
    } catch (error) {
      logger.warn('[OpenAIService.generateSummary] AI failed, returning fallback', { error });
      return 'Summary unavailable.';
    }
  }

  async generateThreadSummary(messages: MessageInput[]): Promise<string> {
    try {
      const langchainService = getLangChainService();
      return await langchainService.generateThreadSummary(messages);
    } catch (error) {
      logger.warn('[OpenAIService.generateThreadSummary] LangChain failed, falling back to basic', {
        error,
      });
      return this.generateSummary(buildMessageContent(messages));
    }
  }

  async generateThreadDNA(messages: MessageInput[]): Promise<ThreadDNA> {
    try {
      const text = await this.callOpenAI(
        THREAD_DNA_SYSTEM_PROMPT,
        `Messages:\n${buildMessageContent(messages)}`,
        200,
        'thread-dna'
      );
      return parseThreadDNA(text);
    } catch (error) {
      logger.error('[OpenAIService.generateThreadDNA]', { error });
      throw error;
    }
  }

  async calculateResolutionScore(messages: MessageInput[]): Promise<number | null> {
    try {
      const text = await this.callOpenAI(
        'Calculate a resolution score 0-100 for a discussion thread. ' +
          'Consider: clear answer present, response depth, consensus, comprehensiveness. ' +
          'Return ONLY a single integer.',
        `Messages:\n${buildMessageContent(messages)}`,
        10,
        'resolution-score'
      );
      return parseResolutionScore(text);
    } catch (error) {
      logger.error('[OpenAIService.calculateResolutionScore]', { error });
      throw error;
    }
  }

  async detectConflicts(messages: MessageInput[]) {
    try {
      const text = await this.callOpenAI(
        CONFLICT_SYSTEM_PROMPT,
        `Messages:\n${buildIndexedContent(messages)}`,
        200,
        'detect-conflicts'
      );
      return parseConflict(text);
    } catch (error) {
      logger.error('[OpenAIService.detectConflicts]', { error });
      throw error;
    }
  }

  async generateDailyDigest(messages: MessageInput[]): Promise<string> {
    try {
      const text = await this.callOpenAI(
        'Generate a daily digest as clean HTML (no html/body tags). ' +
          'Sections: Key Discussions, Decisions Made, Open Questions. ' +
          'Use <h3> and <p>/<ul>. Professional and concise.',
        `Messages:\n${buildMessageContent(messages)}`,
        800,
        'daily-digest'
      );
      return stripHtmlFences(text);
    } catch (error) {
      logger.error('[OpenAIService.generateDailyDigest]', { error });
      throw error;
    }
  }

  async classifyToxicity(content: string): Promise<number> {
    try {
      const text = await this.callOpenAI(
        'You are a content moderation classifier. Analyze the following text for toxicity. ' +
          'Toxicity includes: hate speech, harassment, threats, slurs, explicit content, ' +
          'personal attacks, and harmful language.' +
          DATA_ONLY_INSTRUCTION + '\n\n' +
          'Return ONLY a JSON object with a single field "toxicity" containing a number between 0 and 1, ' +
          'where 0 means completely safe and 1 means extremely toxic.',
        `Text to analyze:\n${wrapUserContent(content.substring(0, MAX_CONTENT_CHARS))}`,
        50,
        'classify-toxicity'
      );
      return parseToxicity(text);
    } catch (error) {
      logger.warn('[OpenAIService.classifyToxicity] AI failed, returning safe score', { error });
      return 0;
    }
  }

  async moderateImageContent(): Promise<ImageModerationResult> {
    return { classification: 'UNKNOWN', confidence: 0, reason: 'OpenAI image moderation not implemented' };
  }
}
