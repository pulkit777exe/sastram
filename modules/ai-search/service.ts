import type {
  SearchConfig,
  RawSearchResults,
  SynthesisResult,
  AISearchResponse,
  PhaseTimings,
  QueryClassification,
} from './types';
import { classifyQuery } from './llm';
import { crossReference, synthesize, generateFollowUps } from './synthesis';
import { logger } from '@/lib/infrastructure/logger';
import { AbortError } from '@/lib/utils/retry';
import type {
  LlmAdapter,
  SearchAdapter,
  SearchCtx,
  SearchStore,
} from './ports';

export type AISearchPipelineResult = AISearchResponse & { followUps: string[]; timings?: PhaseTimings };

/** Terminal check between phases — an aborted deadline must not start more paid work. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError('AI search aborted');
}

/** Forward the caller signal to every LLM call without touching the adapter implementations. */
function bindSignal(llm: LlmAdapter, signal: AbortSignal | undefined): LlmAdapter {
  if (!signal) return llm;
  return {
    generateText: (prompt, opts) => llm.generateText(prompt, { ...opts, signal }),
  };
}

function phaseProviderLabel(config: SearchConfig): string {
  if (config.searchMode === 'instant') {
    return 'exa+gemini';
  }
  return 'exa+tavily+gemini';
}

function elapsedMs(start: number): number {
  return Date.now() - start;
}

/** Read-through cache: a store hit short-circuits the whole pipeline (zero LLM/search calls). Exported so routes share the single read path. */
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

/** Parallel fan-out mirroring searchSources semantics: one side may fail without killing the other. */
async function runSearchFanout(
  query: string,
  classification: QueryClassification,
  config: SearchConfig,
  search: SearchAdapter
): Promise<RawSearchResults> {
  const [exaResult, tavilyResult] = await Promise.allSettled([
    search.exa(query, classification, config),
    search.tavily(query, classification, config),
  ]);

  return {
    exaSources: exaResult.status === 'fulfilled' ? exaResult.value : [],
    tavilySources: tavilyResult.status === 'fulfilled' ? tavilyResult.value.sources : [],
    tavilyAnswer: tavilyResult.status === 'fulfilled' ? tavilyResult.value.answer : undefined,
  };
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

  throwIfAborted(signal);
  // Phase 1: Classify
  const classifyStart = Date.now();
  const classification = await classifyQuery(query, llm);
  const classifyMs = elapsedMs(classifyStart);

  throwIfAborted(signal);
  // Phase 2: Search
  const searchStart = Date.now();
  let rawResults: RawSearchResults;
  const isInstantMode = config.searchMode === 'instant';
  if (isInstantMode) {
    const exaSources = await ctx.search.exa(query, classification, config);
    rawResults = {
      exaSources,
      tavilySources: [],
      tavilyAnswer: undefined,
    };
  } else {
    rawResults = await runSearchFanout(query, classification, config, ctx.search);
  }
  const searchMs = elapsedMs(searchStart);

  throwIfAborted(signal);
  // Phase 3: Cross-reference
  const crossRefStart = Date.now();
  const crossRefResult = await crossReference(rawResults, query, llm);
  const crossrefMs = elapsedMs(crossRefStart);

  const rankedSources = crossRefResult.rankedSources;

  throwIfAborted(signal);
  // Phase 4: Synthesize
  const synthesizeStart = Date.now();
  let synthesis: SynthesisResult;
  if (isInstantMode) {
    synthesis = {
      text: rawResults.tavilyAnswer || 'Instant mode — showing raw results only.',
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
      rawResults.tavilyAnswer,
      ctx.history,
      ctx.expertise
    );
  }
  synthesis.processingTimeMs = elapsedMs(startTime);
  const synthesizeMs = elapsedMs(synthesizeStart);

  throwIfAborted(signal);
  // Phase 5: Follow-ups
  let followUps: string[] = [];
  const shouldGenerateFollowUps = !isInstantMode && Boolean(synthesis.text);
  if (shouldGenerateFollowUps) {
    const followUpText = synthesis.text as string;
    followUps = await generateFollowUps(query, followUpText, llm);
  }

  return {
    synthesis,
    sources: rankedSources,
    phase: 'done',
    followUps,
    timings: {
      classifyMs,
      searchMs,
      crossrefMs,
      synthesizeMs,
      provider: phaseProviderLabel(config),
    },
  };
}
