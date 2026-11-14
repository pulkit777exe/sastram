import type {
  SearchConfig,
  SynthesisResult,
  AISearchResponse,
  PhaseTimings,
  Source,
} from './types';
import { classifyQuery } from './llm';
import { crossReference, synthesize, generateFollowUps } from './synthesis';
import { logger } from '@/lib/infrastructure/logger';
import { AbortError } from '@/lib/utils/retry';
import type { LlmAdapter, SearchCtx, SearchStore } from './ports';
import { runSources } from './source-registry';
import { createDefaultSources, modeConfig, normalizeSearchMode } from './adapters';
import type { SourceRunResult } from './source-types';

export type AISearchPipelineResult = AISearchResponse & { followUps: string[]; timings?: PhaseTimings; sourceRuns?: SourceRunResult[] };

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError('AI search aborted');
}

function bindSignal(llm: LlmAdapter, signal: AbortSignal | undefined): LlmAdapter {
  if (!signal) return llm;
  return {
    generateText: (prompt, opts) => llm.generateText(prompt, { ...opts, signal }),
  };
}

function elapsedMs(start: number): number {
  return Date.now() - start;
}

export async function readThroughCache(
  store: SearchStore,
  query: string,
  expertise?: string
): Promise<AISearchPipelineResult | null> {
  try {
    const cached = await store.get(query, expertise);
    if (!cached) return null;
    const followUpsRaw = (cached as unknown as { followUps?: unknown }).followUps;
    const followUps = Array.isArray(followUpsRaw)
      ? followUpsRaw.filter((f): f is string => typeof f === 'string')
      : [];
    return {
      synthesis: cached.synthesis,
      sources: cached.sources,
      phase: 'done',
      followUps,
    };
  } catch (err) {
    logger.debug('[ai-search] store read failed, proceeding without cache', { error: err });
    return null;
  }
}

function labelFromTier(tier: 1 | 2 | 3 | 4, provider?: string): string {
  if (provider === 'sastram') return 'Sastram';
  if (tier === 1) return 'Official';
  if (tier === 2) return 'Community';
  if (tier === 3) return 'Reference';
  return 'Web';
}

function enrichSources(sources: Source[]): Source[] {
  return sources.map((s) => ({
    ...s,
    tierLabel: s.tierLabel || labelFromTier(s.tier, String(s.provider)),
    sourceLabel: s.sourceLabel || (typeof s.provider === 'string' ? s.provider : 'source'),
  }));
}

export async function executeAISearch(
  query: string,
  config: SearchConfig,
  ctx: SearchCtx
): Promise<AISearchPipelineResult> {
  const startTime = Date.now();
  const signal = ctx.signal;
  throwIfAborted(signal);

  if (ctx.store) {
    const cached = await readThroughCache(ctx.store, query, ctx.expertise);
    if (cached) return cached;
  }

  const llm = bindSignal(ctx.llm, signal);
  const mode = normalizeSearchMode(config.searchMode);
  const mcfg = modeConfig(mode);

  throwIfAborted(signal);
  const classifyStart = Date.now();
  const classification = await classifyQuery(query, llm);
  const classifyMs = elapsedMs(classifyStart);

  throwIfAborted(signal);
  const searchStart = Date.now();
  let merged: Source[] = [];
  let runs: SourceRunResult[] = [];
  if (ctx.search) {
    // Legacy/compat path for injected SearchAdapter (tests, existing callers).
    const [exaResult, tavilyResult] = await Promise.allSettled([
      ctx.search.exa(query, classification, { ...config, searchMode: mode }),
      ctx.search.tavily(query, classification, { ...config, searchMode: mode }),
    ]);
    const exaSources = exaResult.status === 'fulfilled' ? exaResult.value : [];
    const tavilySources = tavilyResult.status === 'fulfilled' ? tavilyResult.value.sources : [];
    const exaMs = 0; const tavMs = 0;
    runs = [
      { key: 'exa', label: 'Exa', tierLabel: 'Web', status: exaResult.status === 'fulfilled' ? 'fulfilled' : 'rejected', sources: exaSources, durationMs: exaMs, error: exaResult.status === 'rejected' ? String(exaResult.reason) : undefined },
      { key: 'tavily', label: 'Tavily', tierLabel: 'Web', status: tavilyResult.status === 'fulfilled' ? 'fulfilled' : 'rejected', sources: tavilySources, durationMs: tavMs, error: tavilyResult.status === 'rejected' ? String(tavilyResult.reason) : undefined },
    ];
    // Preserve legacy merge order for deterministic behavior.
    const seen = new Set<string>();
    for (const s of [...exaSources, ...tavilySources]) {
      const key = (s.url || s.id).replace(/\/$/, '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }
  } else {
    const adapters = createDefaultSources();
    const out = await runSources(adapters, {
      query,
      classification,
      config: { ...config, searchMode: mode },
      mode,
      signal,
      viewerUserId: ctx.viewerUserId,
      viewerRole: ctx.viewerRole,
      keys: ctx.keys,
    });
    merged = out.merged;
    runs = out.runs;
  }
  const searchMs = elapsedMs(searchStart);

  throwIfAborted(signal);
  const crossRefStart = Date.now();
  const crossRefResult = await crossReference({ rankedSourcesInput: merged }, query, llm);
  const crossrefMs = elapsedMs(crossRefStart);

  const rankedSources = enrichSources(crossRefResult.rankedSources.slice(0, mcfg.maxSources));

  throwIfAborted(signal);
  const synthesizeStart = Date.now();
  let synthesis: SynthesisResult;
  if (!mcfg.synthesize) {
    synthesis = {
      text: 'Quick mode — showing ranked sources only.',
      queryType: classification.type,
      sourceCount: rankedSources.length,
      conflictData: crossRefResult.conflictData,
      processingTimeMs: 0,
    };
  } else {
    synthesis = await synthesize(
      query,
      rankedSources,
      classification,
      crossRefResult.conflictData,
      llm,
      undefined,
      ctx.history,
      ctx.expertise
    );
  }
  synthesis.processingTimeMs = elapsedMs(startTime);
  const synthesizeMs = elapsedMs(synthesizeStart);

  throwIfAborted(signal);
  let followUps: string[] = [];
  if (mode !== 'quick' && Boolean(synthesis.text)) {
    followUps = await generateFollowUps(query, synthesis.text as string, llm);
  }

  const provider = Array.from(new Set(runs.filter((r) => r.status === 'fulfilled' && r.sources.length > 0).map((r) => r.key))).join('+') || 'none';
  return {
    synthesis,
    sources: rankedSources,
    phase: 'done',
    followUps,
    sourceRuns: runs,
    timings: {
      classifyMs,
      searchMs,
      crossrefMs,
      synthesizeMs,
      provider,
    },
  };
}
