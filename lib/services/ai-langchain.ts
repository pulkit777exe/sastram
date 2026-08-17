import { Document } from 'langchain';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import type { LLMResult } from '@langchain/core/outputs';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import { logAiUsage } from '@/lib/services/ai-usage-logger';
import type { MessageInput } from '@/lib/ai';

const MAX_CHUNK_CHARS = 8000;

function buildMessageDocuments(messages: MessageInput[]): Document[] {
  return messages.map((m, i) => {
    const ts = m.createdAt ? `[${new Date(m.createdAt).toISOString()}] ` : '';
    const indent = m.depth && m.depth > 0 ? '  (reply) ' : '';
    const name = m.sender?.name ?? 'Unknown';
    const content = `${ts}${indent}${name}: ${m.content}`;
    return new Document({
      pageContent: content.substring(0, MAX_CHUNK_CHARS),
      metadata: { messageId: i + 1 },
    });
  });
}

async function splitDocuments(docs: Document[]): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: MAX_CHUNK_CHARS,
    chunkOverlap: 500,
    separators: ['\n\n', '\n', '. ', ' '],
  });
  return splitter.splitDocuments(docs);
}

function createSummarizeChain(model: ChatGoogleGenerativeAI | ChatOpenAI) {
  const mapPrompt = PromptTemplate.fromTemplate(
    'Summarize the following discussion messages concisely. ' +
      'Focus on key points, decisions, and important information:\n\n' +
      '{context}\n\nConcise summary:'
  );

  const reducePrompt = PromptTemplate.fromTemplate(
    'Combine these partial summaries into a comprehensive summary of the discussion. ' +
      'Focus on key themes, decisions, and important information. ' +
      'Keep it concise but comprehensive (200-400 words):\n\n' +
      '{context}\n\nFinal summary:'
  );

  return {
    mapChain: RunnableSequence.from([mapPrompt, model, new StringOutputParser()]),
    reduceChain: RunnableSequence.from([reducePrompt, model, new StringOutputParser()]),
  };
}

export interface LangChainAIService {
  generateThreadSummary(messages: MessageInput[]): Promise<string>;
}

const MAX_CHUNKS = 20;

abstract class BaseLangChainService implements LangChainAIService {
  protected abstract model: ChatGoogleGenerativeAI | ChatOpenAI;
  /** Provider and model name as recorded in the usage log, not the API model id. */
  protected abstract usageProvider: string;
  protected abstract usageModel: string;

  async generateThreadSummary(messages: MessageInput[]): Promise<string> {
    const docs = buildMessageDocuments(messages);
    if (docs.length === 0) {
      return 'No messages to summarize.';
    }

    const chunks = await splitDocuments(docs);
    const limitedChunks = chunks.slice(0, MAX_CHUNKS);

    logger.info(
      `[LangChain] Summarizing ${messages.length} messages in ${limitedChunks.length} chunks`
    );

    const { mapChain, reduceChain } = createSummarizeChain(this.model);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // LangChain doesn't surface token counts from the chain, so they're
    // accumulated across every LLM call the map/reduce fans out to.
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
      limitedChunks.map((chunk) =>
        mapChain.invoke({ context: chunk.pageContent }, { callbacks: [usageTracker] })
      )
    );

    const combinedSummary = await reduceChain.invoke(
      { context: summaries.join('\n\n') },
      { callbacks: [usageTracker] }
    );

    logAiUsage({
      operation: 'thread-summary',
      provider: this.usageProvider,
      model: this.usageModel,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs: Date.now() - start,
    }).catch((e) => logger.warn('[ai-langchain] usage log failed', { error: e }));

    return combinedSummary;
  }
}

export class LangChainGeminiService extends BaseLangChainService {
  protected model: ChatGoogleGenerativeAI;
  protected usageProvider = 'gemini';
  protected usageModel = 'gemini-flash';

  constructor(apiKey: string) {
    super();
    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model: getEnv().GEMINI_FLASH_MODEL,
      maxOutputTokens: 2048,
      temperature: 0.3,
    });
  }
}

export class LangChainOpenAIService extends BaseLangChainService {
  protected model: ChatOpenAI;
  protected usageProvider = 'openai';
  protected usageModel = 'gpt-4o-mini';

  constructor(apiKey: string) {
    super();
    this.model = new ChatOpenAI({
      apiKey,
      model: getEnv().OPENAI_MODEL,
      maxTokens: 2048,
      temperature: 0.3,
    });
  }
}

let langchainService: LangChainAIService | null = null;

export function getLangChainService(): LangChainAIService {
  if (langchainService) return langchainService;

  const envConfig = getEnv();
  const provider = envConfig.AI_PROVIDER;
  const key = provider === 'gemini' ? envConfig.GEMINI_API_KEY : envConfig.OPENAI_API_KEY;

  if (!key) {
    logger.warn('[LangChain] AI provider not configured');
    throw new Error('AI provider not configured');
  }

  langchainService =
    provider === 'gemini'
      ? new LangChainGeminiService(key)
      : new LangChainOpenAIService(key);

  return langchainService;
}
