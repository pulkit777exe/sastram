import type {
  SearchConfig,
  RawSearchResults,
  SynthesisResult,
  AISearchResponse,
  PhaseTimings,
} from './types';
import { classifyQuery } from './llm';
import { searchWithExa, searchSources } from './search-providers';
import { crossReference, synthesize, generateFollowUps } from './synthesis';

export type AISearchPipelineResult = AISearchResponse & { followUps: string[]; timings?: PhaseTimings };

function phaseProviderLabel(config: SearchConfig): string {
  const parts: string[] = [];
  if (config.exaMode) parts.push('exa');
  if (config.searchMode !== 'instant') parts.push('tavily');
  parts.push('gemini');
  return parts.join('+');
}

export async function executeAISearch(
  query: string,
  config: SearchConfig,
  keys: { exa: string; tavily: string; gemini: string; openai?: string },
  conversationHistory?: { role: string; content: string }[]
): Promise<AISearchPipelineResult> {
  const startTime = Date.now();
  const t0 = Date.now();

  // Phase 1: Classify
  const classification = await classifyQuery(query, keys.gemini, keys.openai);
  const classifyMs = Date.now() - t0;

  // Phase 2: Search (skip Tavily if instant mode)
  const t1 = Date.now();
  let rawResults: RawSearchResults;
  if (config.searchMode === 'instant') {
    const exaSources = await searchWithExa(query, classification, keys.exa, config);
    rawResults = { exaSources, tavilySources: [], tavilyAnswer: undefined };
  } else {
    rawResults = await searchSources(query, classification, keys.exa, keys.tavily, config);
  }
  const searchMs = Date.now() - t1;

  const t2 = Date.now();
  const crossRefResult = await crossReference(rawResults, query, keys.gemini, keys.openai);
  const crossrefMs = Date.now() - t2;

  const rankedSources = crossRefResult.rankedSources;

  const t3 = Date.now();
  let synthesis: SynthesisResult;
  if (config.searchMode === 'instant') {
    synthesis = {
      content: rawResults.tavilyAnswer || 'Instant mode — showing raw results only.',
      queryType: classification.type,
      sourceCount: rankedSources.length,
      conflictData: crossRefResult.conflictData,
      processingTimeMs: Date.now() - startTime,
    };
  } else {
    synthesis = await synthesize(
      query,
      rankedSources,
      classification,
      crossRefResult.conflictData,
      keys.gemini,
      rawResults.tavilyAnswer,
      keys.openai,
      conversationHistory
    );
    synthesis.processingTimeMs = Date.now() - startTime;
  }
  const synthesizeMs = Date.now() - t3;

  let followUps: string[] = [];
  if (config.searchMode !== 'instant' && synthesis.text) {
    followUps = await generateFollowUps(query, synthesis.text, keys.gemini, keys.openai);
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
