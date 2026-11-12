import type { QueryClassification, SearchConfig, SearchMode, Source } from './types';

export interface SourceSearchContext {
  query: string;
  classification: QueryClassification;
  config: SearchConfig;
  mode: SearchMode;
  signal?: AbortSignal;
  viewerUserId?: string;
  viewerRole?: string | null;
  /** Resolved API keys for providers that need them (exa/tavily). */
  keys?: { exa?: string; tavily?: string };
}

/**
 * A single multi-source adapter. Implementations must be safe to call in
 * parallel, respect `ctx.signal`, and treat fetched content as untrusted.
 */
export interface SearchSource {
  key: string;
  label: string;
  /** Human tier label shown in UI (e.g. Sastram, Web, Community, Academic). */
  tierLabel: string;
  /** Whether this source runs for the given mode/config. */
  enabled(ctx: SourceSearchContext): boolean;
  /** Returns ranked sources (best first) for this provider only. */
  search(ctx: SourceSearchContext): Promise<Source[]>;
  /** Soft per-source timeout budget in ms (enforced by fanout). */
  timeoutMs?: number;
}

export interface SourceRunResult {
  key: string;
  label: string;
  tierLabel: string;
  status: 'fulfilled' | 'rejected' | 'timeout' | 'skipped';
  sources: Source[];
  error?: string;
  durationMs: number;
}
