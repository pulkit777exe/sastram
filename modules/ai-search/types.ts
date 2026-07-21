export interface SearchConfig {
  exaMode: 'agentic' | 'instant' | 'websets';
  tavilyMode: 'search' | 'extract' | 'crawl' | 'research';
  sourceFilter: 'all' | 'technical' | 'reddit-hn' | 'docs';
  searchMode: 'standard' | 'instant' | 'table';
}

export interface QueryClassification {
  type: 'factual' | 'opinion' | 'technical' | 'comparison';
  primaryDomain: string;
  suggestedSources: string[];
  searchTerms: string[];
  isControversial: boolean;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  text: string;
  publishedDate?: string;
  tier: 1 | 2 | 3 | 4;
  confidence: number;
  isOutdated: boolean;
  provider: 'exa' | 'tavily';
  /** Whether the source's full text was actually retrieved (vs. only a search-API snippet). Synthesis must only cite sources with contentFetched=true. */
  contentFetched: boolean;
}

/** Per-phase timing + provider metadata captured at write time (harness §10). */
export interface PhaseTimings {
  classifyMs?: number;
  searchMs?: number;
  crossrefMs?: number;
  synthesizeMs?: number;
  provider?: string;
  tokenCostUsd?: number;
}

export interface ConflictInfo {
  detected: boolean;
  description: string;
  sideA: string;
  sideB: string;
}

export type QueryType = 'factual' | 'opinion' | 'technical' | 'comparison';

export interface Citation {
  marker: number;
  sourceId: string;
}

export interface SynthesisResult {
  content: string;
  confidence?: number;
  queryType: QueryType;
  sourceCount: number;
  conflictData: ConflictInfo;
  processingTimeMs: number;
  cachedAt?: string;
  /** New citable synthesis shape. `text` carries inline [n] markers. */
  text?: string;
  citations?: Citation[];
}

export interface AISearchResponse {
  synthesis: SynthesisResult;
  sources: Source[];
  phase: 'classify' | 'search' | 'crossref' | 'synthesize' | 'done' | 'refine';
  error?: string;
  timings?: PhaseTimings;
}

export interface PastSearch {
  id: string;
  query: string;
  timestamp: number;
  resultCount: number;
}

export interface RawSearchResults {
  exaSources: Source[];
  tavilySources: Source[];
  tavilyAnswer?: string;
}

export interface CrossRefResult {
  rankedSources: Source[];
  conflictData: ConflictInfo;
}
