import { withRetry } from '@/lib/utils/retry';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

interface MessageInput {
  content: string;
  sender?: { name: string | null } | null;
  createdAt?: Date | string;
  depth?: number;
}

const threadDNASchema = z.object({
  questionType: z.enum(['factual', 'opinion', 'technical', 'comparison', 'other']),
  expertiseLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  topics: z.array(z.string()).min(1).max(5),
  readTimeMinutes: z.number().int().min(1),
});

const conflictSchema = z.object({
  hasConflict: z.boolean(),
  conflictingMessages: z.tuple([z.number(), z.number()]).optional(),
  reason: z.string().optional(),
});

export type ThreadDNA = z.infer<typeof threadDNASchema>;
export type ConflictResult = z.infer<typeof conflictSchema>;

const DEFAULT_THREAD_DNA: ThreadDNA = {
  questionType: 'other',
  expertiseLevel: 'intermediate',
  topics: ['general discussion'],
  readTimeMinutes: 1,
};

const DEFAULT_CONFLICT: ConflictResult = { hasConflict: false };

const MAX_CONTENT_CHARS = 12_000;
const AI_TIMEOUT_MS = 15_000;

const THREAD_DNA_SYSTEM_PROMPT =
  'You are a helpful assistant that analyzes discussion threads. ' +
  'Return ONLY valid JSON with no markdown fences. Fields: ' +
  "questionType (one of 'factual','opinion','technical','comparison','other'), " +
  "expertiseLevel (one of 'beginner','intermediate','advanced','expert'), " +
  'topics (array of 1-5 key topics as short strings), ' +
  'readTimeMinutes (integer estimated reading time).';

const CONFLICT_SYSTEM_PROMPT =
  'You are a helpful assistant that detects conflicts in discussions. ' +
  'A conflict is when two messages present contradictory facts that cannot both be true. ' +
  'Return ONLY valid JSON with no markdown fences. Fields: ' +
  'hasConflict (boolean), ' +
  'conflictingMessages (optional tuple of exactly two message numbers), ' +
  'reason (optional string explaining the conflict).';

function buildMessageContent(messages: MessageInput[]): string {
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

function buildIndexedContent(messages: MessageInput[]): string {
  return messages
    .map((m, i) => {
      const name = m.sender?.name ?? 'Unknown';
      return `${i + 1}. ${name}: ${m.content}`;
    })
    .join('\n')
    .substring(0, MAX_CONTENT_CHARS);
}

function cleanJsonText(text: string): string {
  return text
    .trim()
    .replace(/```json\n?|```\n?/g, '')
    .trim();
}

function parseThreadDNA(text: string): ThreadDNA {
  try {
    const parsed = threadDNASchema.safeParse(JSON.parse(cleanJsonText(text)));
    if (!parsed.success) {
      logger.warn('[parseThreadDNA] Zod validation failed', {
        error: parsed.error.flatten(),
      });
      return DEFAULT_THREAD_DNA;
    }
    return parsed.data;
  } catch (err) {
    logger.warn('[parseThreadDNA] JSON parse failed', { error: err });
    return DEFAULT_THREAD_DNA;
  }
}

function parseConflict(text: string): ConflictResult {
  try {
    const parsed = conflictSchema.safeParse(JSON.parse(cleanJsonText(text)));
    if (!parsed.success) {
      logger.warn('[parseConflict] Zod validation failed', {
        error: parsed.error.flatten(),
      });
      return DEFAULT_CONFLICT;
    }
    return parsed.data;
  } catch (err) {
    logger.warn('[parseConflict] JSON parse failed', { error: err });
    return DEFAULT_CONFLICT;
  }
}

function parseResolutionScore(text: string): number {
  const score = parseInt(text.trim(), 10);
  if (isNaN(score)) {
    logger.warn('[parseResolutionScore] Non-integer response from AI', { text });
    return 50;
  }
  return Math.max(0, Math.min(100, score));
}

function makeAbortController(): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  return { controller, clear: () => clearTimeout(timer) };
}

export interface AIService {
  generateSummary(content: string): Promise<string>;
  generateThreadSummary(messages: MessageInput[]): Promise<string>;
  generateDailyDigest(messages: MessageInput[]): Promise<string>;
  generateThreadDNA(messages: MessageInput[]): Promise<ThreadDNA>;
  calculateResolutionScore(messages: MessageInput[]): Promise<number>;
  detectConflicts(messages: MessageInput[]): Promise<ConflictResult>;
  generateStreamingResponse(content: string, onChunk: (chunk: string) => void): Promise<void>;
}

export class GeminiService implements AIService {
  // Model instantiated once in constructor — not per call
  private flashModel: GenerativeModel;
  private proModel: GenerativeModel;

  constructor(apiKey: string) {
    // Dynamic import at construction time, not per method call
    const genAI = new GoogleGenerativeAI(apiKey);
    this.flashModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.proModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }

  async generateStreamingResponse(
    content: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const { controller, clear } = makeAbortController();
    try {
      const result = await this.flashModel.generateContentStream(content, {
        signal: controller.signal,
      });
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) onChunk(text);
      }
    } catch (error) {
      logger.error('[GeminiService.generateStreamingResponse]', { error });
      throw error;
    } finally {
      clear();
    }
  }

  async generateSummary(content: string): Promise<string> {
    const prompt =
      'Summarize this discussion thread. Focus on key points, decisions, and important information. ' +
      'Keep it concise but comprehensive (200-300 words):\n\n' +
      content.substring(0, MAX_CONTENT_CHARS) +
      '\n\nSummary:';

    const { controller, clear } = makeAbortController();
    try {
      const result = await withRetry(() =>
        this.flashModel.generateContent(prompt, {
          signal: controller.signal,
        })
      );
      return result.response.text();
    } catch (error) {
      logger.error('[GeminiService.generateSummary]', { error });
      // Summary is non-critical — return fallback, do not throw
      return 'Summary unavailable.';
    } finally {
      clear();
    }
  }

  async generateThreadSummary(messages: MessageInput[]): Promise<string> {
    return this.generateSummary(buildMessageContent(messages));
  }

  async generateThreadDNA(messages: MessageInput[]): Promise<ThreadDNA> {
    const content = buildMessageContent(messages);
    const prompt = `${THREAD_DNA_SYSTEM_PROMPT}\n\nMessages:\n${content}\n\nJSON:`;

    const { controller, clear } = makeAbortController();
    try {
      const result = await withRetry(() =>
        this.flashModel.generateContent(prompt, {
          signal: controller.signal,
        })
      );
      return parseThreadDNA(result.response.text());
    } catch (error) {
      logger.error('[GeminiService.generateThreadDNA]', { error });
      // Throw so BullMQ retries — do not silently return default
      throw error;
    } finally {
      clear();
    }
  }

  async calculateResolutionScore(messages: MessageInput[]): Promise<number> {
    const content = buildMessageContent(messages);
    const prompt =
      'Calculate a resolution score (0-100) for this thread. Consider: ' +
      'clear answer/solution present, depth of responses, consensus level, comprehensiveness. ' +
      'Return ONLY a single integer 0-100.\n\nMessages:\n' +
      content +
      '\n\nScore:';

    const { controller, clear } = makeAbortController();
    try {
      const result = await withRetry(() =>
        this.flashModel.generateContent(prompt, {
          signal: controller.signal,
        })
      );
      return parseResolutionScore(result.response.text());
    } catch (error) {
      logger.error('[GeminiService.calculateResolutionScore]', { error });
      throw error;
    } finally {
      clear();
    }
  }

  async detectConflicts(messages: MessageInput[]): Promise<ConflictResult> {
    const content = buildIndexedContent(messages);
    const prompt = `${CONFLICT_SYSTEM_PROMPT}\n\nMessages:\n${content}\n\nJSON:`;

    const { controller, clear } = makeAbortController();
    try {
      const result = await withRetry(() =>
        this.flashModel.generateContent(prompt, {
          signal: controller.signal,
        })
      );
      return parseConflict(result.response.text());
    } catch (error) {
      logger.error('[GeminiService.detectConflicts]', { error });
      throw error;
    } finally {
      clear();
    }
  }

  async generateDailyDigest(messages: MessageInput[]): Promise<string> {
    const content = buildMessageContent(messages);
    const prompt =
      'Generate a daily digest for this forum thread as clean HTML ' +
      '(no <html>/<body> tags, just content divs). ' +
      'Use <h3> for section headers and <p>/<ul> for content. ' +
      'Sections: Key Discussions, Decisions Made, Open Questions. ' +
      'Professional and concise.\n\nMessages:\n' +
      content;

    const { controller, clear } = makeAbortController();
    try {
      const result = await withRetry(() =>
        this.proModel.generateContent(prompt, {
          signal: controller.signal,
        })
      );
      return result.response
        .text()
        .replace(/```html\n?/g, '')
        .replace(/```\n?/g, '');
    } catch (error) {
      logger.error('[GeminiService.generateDailyDigest]', { error });
      throw error;
    } finally {
      clear();
    }
  }
}

// ── OPENAI SERVICE ─────────────────────────────────────────────────────────

export class OpenAIService implements AIService {
  // Note: OPENAI_API_KEY — no NEXT_PUBLIC_ prefix. Server-only secret.
  private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly headers: Record<string, string>;

  constructor(apiKey: string) {
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private async callOpenAI(
    systemPrompt: string,
    userContent: string,
    maxTokens: number
  ): Promise<string> {
    const { controller, clear } = makeAbortController();
    try {
      const data = await withRetry(async () => {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            max_tokens: maxTokens,
            temperature: 0.4,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`OpenAI ${response.status}: ${errorText}`);
        }

        return response.json();
      });

      return data.choices[0]?.message?.content ?? '';
    } finally {
      clear();
    }
  }

  async generateStreamingResponse(
    content: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const { controller, clear } = makeAbortController();
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
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
        signal: controller.signal,
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

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep last potentially incomplete line in buffer
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
            // Incomplete JSON chunk — will be combined in next read
          }
        }
      }
    } catch (error) {
      logger.error('[OpenAIService.generateStreamingResponse]', { error });
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
        500
      );
    } catch (error) {
      logger.error('[OpenAIService.generateSummary]', { error });
      return 'Summary unavailable.';
    }
  }

  async generateThreadSummary(messages: MessageInput[]): Promise<string> {
    return this.generateSummary(buildMessageContent(messages));
  }

  async generateThreadDNA(messages: MessageInput[]): Promise<ThreadDNA> {
    try {
      const text = await this.callOpenAI(
        THREAD_DNA_SYSTEM_PROMPT,
        `Messages:\n${buildMessageContent(messages)}`,
        200
      );
      return parseThreadDNA(text);
    } catch (error) {
      logger.error('[OpenAIService.generateThreadDNA]', { error });
      throw error;
    }
  }

  async calculateResolutionScore(messages: MessageInput[]): Promise<number> {
    try {
      const text = await this.callOpenAI(
        'Calculate a resolution score 0-100 for a discussion thread. ' +
          'Consider: clear answer present, response depth, consensus, comprehensiveness. ' +
          'Return ONLY a single integer.',
        `Messages:\n${buildMessageContent(messages)}`,
        10
      );
      return parseResolutionScore(text);
    } catch (error) {
      logger.error('[OpenAIService.calculateResolutionScore]', { error });
      throw error;
    }
  }

  async detectConflicts(messages: MessageInput[]): Promise<ConflictResult> {
    try {
      const text = await this.callOpenAI(
        CONFLICT_SYSTEM_PROMPT,
        `Messages:\n${buildIndexedContent(messages)}`,
        200
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
        800
      );
      return text.replace(/```html\n?/g, '').replace(/```\n?/g, '');
    } catch (error) {
      logger.error('[OpenAIService.generateDailyDigest]', { error });
      throw error;
    }
  }
}

// ── FACTORY ────────────────────────────────────────────────────────────────

class AIServiceFactory {
  static create(provider: 'gemini' | 'openai', apiKey: string): AIService {
    if (provider === 'gemini') return new GeminiService(apiKey);
    if (provider === 'openai') return new OpenAIService(apiKey);
    throw new Error(`Unknown AI provider: ${provider}`);
  }
}

class NoOpAIService implements AIService {
  async generateSummary() {
    return "Summary unavailable (AI not configured).";
  }
  async generateThreadSummary() {
    return "Summary unavailable (AI not configured).";
  }
  async generateDailyDigest() {
    return "<p>AI digest not available.</p>";
  }
  async generateThreadDNA() {
    return DEFAULT_THREAD_DNA;
  }
  async calculateResolutionScore() {
    return 50;
  }
  async detectConflicts() {
    return { hasConflict: false };
  }
  async generateStreamingResponse(_content: string, onChunk: (chunk: string) => void) {
    onChunk("(AI not configured)");
  }
}

// ── SINGLETON EXPORT ───────────────────────────────────────────────────────

function createAiService(): AIService {
  const provider = (process.env.AI_PROVIDER as 'gemini' | 'openai' | undefined) ?? 'gemini';
  const key = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;

  if (!key) {
    logger.warn(
      `[AI Service] ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} ` +
        `not set. AI features disabled.`
    );
    return new NoOpAIService();
  }

  logger.info(`[AI Service] Initializing with provider: ${provider}`);
  return AIServiceFactory.create(provider, key);
}

export const aiService: AIService = createAiService();
