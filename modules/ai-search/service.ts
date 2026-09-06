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
  if (config.searchMode === 'instant') {
    return 'exa+gemini';
  }
  return 'exa+tavily+gemini';
}

function elapsedMs(start: number): number {
  return Date.now() - start;
}

export async function executeAISearch(
  query: string,
  config: SearchConfig,
  keys: { exa: string; tavily: string; gemini: string; openai?: string },
  conversationHistory?: { role: string; content: string }[]
): Promise<AISearchPipelineResult> {
  const startTime = Date.now();

  // Phase 1: Classify
  const classifyStart = Date.now();
  const classification = await classifyQuery(query, keys.gemini, keys.openai);
  const classifyMs = elapsedMs(classifyStart);

  // Phase 2: Search
  const searchStart = Date.now();
  let rawResults: RawSearchResults;
  const isInstantMode = config.searchMode === 'instant';
  if (isInstantMode) {
    const exaSources = await searchWithExa(query, classification, keys.exa, config);
    rawResults = {
      exaSources,
      tavilySources: [],
      tavilyAnswer: undefined,
    };
  } else {
    rawResults = await searchSources(query, classification, keys.exa, keys.tavily, config);
  }
  const searchMs = elapsedMs(searchStart);

  // Phase 3: Cross-reference
  const crossRefStart = Date.now();
  const crossRefResult = await crossReference(rawResults, query, keys.gemini, keys.openai);
  const crossrefMs = elapsedMs(crossRefStart);

  const rankedSources = crossRefResult.rankedSources;

  // Phase 4: Synthesize
  const synthesizeStart = Date.now();
  let synthesis: SynthesisResult;
  if (isInstantMode) {
    synthesis = {
      content: rawResults.tavilyAnswer || 'Instant mode — showing raw results only.',
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
      keys.gemini,
      rawResults.tavilyAnswer,
      keys.openai,
      conversationHistory
    );
  }
  synthesis.processingTimeMs = elapsedMs(startTime);
  const synthesizeMs = elapsedMs(synthesizeStart);

  // Phase 5: Follow-ups
  let followUps: string[] = [];
  const shouldGenerateFollowUps = !isInstantMode && Boolean(synthesis.text);
  if (shouldGenerateFollowUps) {
    const followUpText = synthesis.text as string;
    followUps = await generateFollowUps(query, followUpText, keys.gemini, keys.openai);
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
