import type {
  QueryClassification,
  SearchConfig,
  Source,
  AISearchResponse,
} from './types';
import type { AISearchPipelineResult } from './service';

export interface ConversationMessage {
  role: string;
  content: string;
}

export interface LlmGenerateOptions {
  model?: string;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface LlmAdapter {
  generateText(prompt: string, opts?: LlmGenerateOptions): Promise<string>;
}

export interface TavilySearchOutcome {
  sources: Source[];
  answer?: string;
}

/** Legacy web-search seam kept for compatibility with existing callers/tests. */
export interface SearchAdapter {
  exa(query: string, classification: QueryClassification, config: SearchConfig): Promise<Source[]>;
  tavily(
    query: string,
    classification: QueryClassification,
    config: SearchConfig
  ): Promise<TavilySearchOutcome>;
}

export interface SearchStore {
  get(query: string, expertiseLevel?: string): Promise<AISearchResponse | null>;
  put(
    query: string,
    result: AISearchPipelineResult,
    queryType: string,
    expertiseLevel?: string
  ): Promise<void>;
}

export interface SearchCtx {
  llm: LlmAdapter;
  search?: SearchAdapter;
  store?: SearchStore;
  history?: ConversationMessage[];
  expertise?: string;
  signal?: AbortSignal;
  /** Viewer context for internal/Sastram sources (visibility-respecting). */
  viewerUserId?: string;
  viewerRole?: string | null;
  /** Provider keys for adapters that require them. */
  keys?: { exa?: string; tavily?: string };
}
