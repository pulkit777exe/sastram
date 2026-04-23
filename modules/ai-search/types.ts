// ─────────────────────────────────────────────────────────────
// AI Search — Type Definitions
// ─────────────────────────────────────────────────────────────

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
}

export interface ConflictInfo {
  detected: boolean;
  description: string;
  sideA: string;
  sideB: string;
}

export interface SynthesisResult {
  content: string;
  confidence: number;
  queryType: QueryClassification['type'];
  sourceCount: number;
  conflictData: ConflictInfo;
  processingTimeMs: number;
  cachedAt?: string;
}

export interface AISearchResponse {
  synthesis: SynthesisResult;
  sources: Source[];
  phase: 'classify' | 'search' | 'crossref' | 'synthesize' | 'done';
  error?: string;
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
