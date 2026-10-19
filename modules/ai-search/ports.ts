import type {
  QueryClassification,
  SearchConfig,
  Source,
  AISearchResponse,
} from './types';
import type { AISearchPipelineResult } from './service';

/** Chat turn passed to synthesis for context (never cited, never persisted as a source). */
export interface ConversationMessage {
  role: string;
  content: string;
}

export interface LlmGenerateOptions {
  model?: string;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

/** Minimal text-generation seam. Backed by Gemini→OpenAI failover in lib/ai/text. */
export interface LlmAdapter {
  generateText(prompt: string, opts?: LlmGenerateOptions): Promise<string>;
}

export interface TavilySearchOutcome {
  sources: Source[];
  answer?: string;
}

/** Web-search seam. Live impl wraps modules/ai-search/search-providers. */
export interface SearchAdapter {
  exa(query: string, classification: QueryClassification, config: SearchConfig): Promise<Source[]>;
  tavily(
    query: string,
    classification: QueryClassification,
    config: SearchConfig
  ): Promise<TavilySearchOutcome>;
}

/** Cache seam. Prisma impl lives in modules/ai-search/cache. */
export interface SearchStore {
  get(query: string, expertiseLevel?: string): Promise<AISearchResponse | null>;
  put(
    query: string,
    result: AISearchPipelineResult,
    queryType: string,
    expertiseLevel?: string
  ): Promise<void>;
}

/** Injected pipeline context — replaces threading raw API keys through every phase. */
export interface SearchCtx {
  llm: LlmAdapter;
  search: SearchAdapter;
  store?: SearchStore;
  history?: ConversationMessage[];
  expertise?: string;
  /** Caller deadline/abort signal — checked between phases, forwarded to every LLM call. */
  signal?: AbortSignal;
}
