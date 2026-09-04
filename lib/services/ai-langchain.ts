import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { LLMResult } from '@langchain/core/outputs';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import { logAiUsage } from '@/lib/services/ai-usage-logger';
import type { MessageInput } from '@/lib/ai';

const MAX_CHUNK_CHARS = 8000; // fits within Gemini 8k context window with headroom
const CHUNK_OVERLAP_CHARS = 500; // preserves sentence continuity across boundaries

function buildMessageDocuments(messages: MessageInput[]): Document[] {
  return messages.map((message, index) => {
    let timestampPrefix = '';
    if (message.createdAt !== undefined && message.createdAt !== null) {
      timestampPrefix = `[${new Date(message.createdAt).toISOString()}] `;
    }
    let replyIndent = '';
    if (message.depth !== undefined && message.depth !== null && message.depth > 0) {
      replyIndent = '  (reply) ';
    }
    const senderName = message.sender?.name ?? 'Unknown';
    const formattedContent = `${timestampPrefix}${replyIndent}${senderName}: ${message.content}`;
    return new Document({
      pageContent: formattedContent.substring(0, MAX_CHUNK_CHARS),
      metadata: { messageId: index + 1 },
    });
  });
}

async function splitIntoChunks(documents: Document[]): Promise<Document[]> {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: MAX_CHUNK_CHARS,
    chunkOverlap: CHUNK_OVERLAP_CHARS,
    separators: ['\n\n', '\n', '. ', ' '],
  });
  return textSplitter.splitDocuments(documents);
}

const MAP_PROMPT_PREFIX =
  'Summarize the following discussion messages concisely. Focus on key points, decisions, and important information:\n\n';
const MAP_PROMPT_SUFFIX = '\n\nConcise summary:';
const REDUCE_PROMPT_PREFIX =
  'Combine these partial summaries into a comprehensive summary of the discussion. Focus on key themes, decisions, and important information. Keep it concise but comprehensive (200-400 words):\n\n';
const REDUCE_PROMPT_SUFFIX = '\n\nFinal summary:';

function buildMapPrompt(context: string): string {
  return MAP_PROMPT_PREFIX + context + MAP_PROMPT_SUFFIX;
}

function buildReducePrompt(context: string): string {
  return REDUCE_PROMPT_PREFIX + context + REDUCE_PROMPT_SUFFIX;
}

async function invokeModel(
  model: ChatGoogleGenerativeAI | ChatOpenAI,
  prompt: string,
  usageTracker: { handleLLMEnd(output: LLMResult): void }
): Promise<string> {
  const result = await model.invoke(prompt, { callbacks: [usageTracker] });
  if (typeof result === 'string') return result;
  const content = (result as unknown as { content: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const part of content) {
      if (typeof part === 'string') {
        textParts.push(part);
      } else {
        const textValue = (part as { text?: string }).text;
        if (textValue !== undefined && textValue !== null) {
          textParts.push(textValue);
        } else {
          textParts.push('');
        }
      }
    }
    return textParts.join('');
  }
  return String(content ?? '');
}

export interface LangChainAIService {
  generateThreadSummary(messages: MessageInput[]): Promise<string>;
}

const MAX_CHUNKS = 20;

function createLangChainService(
  model: ChatGoogleGenerativeAI | ChatOpenAI,
  usageProvider: string,
  usageModel: string
): LangChainAIService {
  return {
    async generateThreadSummary(messages: MessageInput[]): Promise<string> {
      const messageDocuments = buildMessageDocuments(messages);
      if (messageDocuments.length === 0) {
        return 'No messages to summarize.';
      }

      const allChunks = await splitIntoChunks(messageDocuments);
      const limitedChunks = allChunks.slice(0, MAX_CHUNKS);

      logger.info(`[LangChain] Summarizing ${messages.length} messages in ${limitedChunks.length} chunks`);

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const usageTracker = {
        handleLLMEnd(output: LLMResult) {
          const usage = output.llmOutput?.usage as Record<string, number> | undefined;
          if (usage) {
            totalInputTokens += usage.prompt_tokens ?? usage.input_tokens ?? 0;
            totalOutputTokens += usage.completion_tokens ?? usage.output_tokens ?? 0;
          }
        },
      };

      const start = Date.now();

      const summaries = await Promise.all(
        limitedChunks.map((chunkDocument: Document) =>
          invokeModel(model, buildMapPrompt(chunkDocument.pageContent), usageTracker)
        )
      );

      const combinedSummary = await invokeModel(model, buildReducePrompt(summaries.join('\n\n')), usageTracker);

      logAiUsage({
        operation: 'thread-summary',
        provider: usageProvider,
        model: usageModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        latencyMs: Date.now() - start,
      }).catch((loggingError) => logger.warn('[ai-langchain] usage log failed', { error: loggingError }));

      return combinedSummary;
    },
  };
}

let langchainService: LangChainAIService | null = null;

export function getLangChainService(): LangChainAIService {
  if (langchainService !== null) return langchainService;

  const envConfig = getEnv();
  const providerName = envConfig.AI_PROVIDER;
  let apiKey: string | undefined = undefined;
  if (providerName === 'gemini') {
    apiKey = envConfig.GEMINI_API_KEY;
  } else {
    apiKey = envConfig.OPENAI_API_KEY;
  }

  if (apiKey === undefined || apiKey.length === 0) {
    logger.warn('[LangChain] AI provider not configured');
    throw new Error('AI provider not configured');
  }

  if (providerName === 'gemini') {
    const model = new ChatGoogleGenerativeAI({
      apiKey,
      model: getEnv().GEMINI_FLASH_MODEL,
      maxOutputTokens: 2048,
      temperature: 0.3,
    });
    langchainService = createLangChainService(model, 'gemini', 'gemini-flash');
  } else {
    const model = new ChatOpenAI({
      apiKey,
      model: getEnv().OPENAI_MODEL,
      maxTokens: 2048,
      temperature: 0.3,
    });
    langchainService = createLangChainService(model, 'openai', 'gpt-4o-mini');
  }

  return langchainService;
}
