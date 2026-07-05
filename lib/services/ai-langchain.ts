import { Document } from 'langchain';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  RunnableSequence,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';

const MAX_CHUNK_CHARS = 8000;
const MAX_TOTAL_CHARS = 50000;

interface MessageInput {
  content: string;
  sender?: { name: string | null } | null;
  createdAt?: Date | string;
  depth?: number;
}

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

  const mapChain = RunnableSequence.from([
    mapPrompt,
    model,
    new StringOutputParser(),
  ]);

  const reduceChain = RunnableSequence.from([
    reducePrompt,
    model,
    new StringOutputParser(),
  ]);

  return { mapChain, reduceChain };
}

export interface LangChainAIService {
  generateThreadSummary(messages: MessageInput[]): Promise<string>;
}

export class LangChainGeminiService implements LangChainAIService {
  private model: ChatGoogleGenerativeAI;
  private maxChunks: number;

  constructor(apiKey: string) {
    const env = getEnv();
    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model: env.GEMINI_FLASH_MODEL,
      maxOutputTokens: 2048,
      temperature: 0.3,
    });
    this.maxChunks = 20;
  }

  async generateThreadSummary(messages: MessageInput[]): Promise<string> {
    const docs = buildMessageDocuments(messages);
    if (docs.length === 0) {
      return 'No messages to summarize.';
    }

    const chunks = await splitDocuments(docs);
    const limitedChunks = chunks.slice(0, this.maxChunks);

    logger.info(
      `[LangChain] Summarizing ${messages.length} messages in ${limitedChunks.length} chunks`
    );

    const { mapChain, reduceChain } = createSummarizeChain(this.model);

    const summaries = await Promise.all(
      limitedChunks.map((chunk) =>
        mapChain.invoke({ context: chunk.pageContent })
      )
    );

    const combinedSummary = await reduceChain.invoke({
      context: summaries.join('\n\n'),
    });

    return combinedSummary;
  }
}

export class LangChainOpenAIService implements LangChainAIService {
  private model: ChatOpenAI;
  private maxChunks: number;

  constructor(apiKey: string) {
    const env = getEnv();
    this.model = new ChatOpenAI({
      apiKey,
      model: env.OPENAI_MODEL,
      maxTokens: 2048,
      temperature: 0.3,
    });
    this.maxChunks = 20;
  }

  async generateThreadSummary(messages: MessageInput[]): Promise<string> {
    const docs = buildMessageDocuments(messages);
    if (docs.length === 0) {
      return 'No messages to summarize.';
    }

    const chunks = await splitDocuments(docs);
    const limitedChunks = chunks.slice(0, this.maxChunks);

    logger.info(
      `[LangChain] Summarizing ${messages.length} messages in ${limitedChunks.length} chunks`
    );

    const { mapChain, reduceChain } = createSummarizeChain(this.model);

    const summaries = await Promise.all(
      limitedChunks.map((chunk) =>
        mapChain.invoke({ context: chunk.pageContent })
      )
    );

    const combinedSummary = await reduceChain.invoke({
      context: summaries.join('\n\n'),
    });

    return combinedSummary;
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
