import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { withRetry } from '@/lib/utils/retry';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/utils/prompt-boundary';
import type {
  SearchConfig,
  QueryClassification,
  Source,
  ConflictInfo,
  RawSearchResults,
  CrossRefResult,
  SynthesisResult,
  QueryType,
  Citation,
  AISearchResponse,
  PhaseTimings,
} from './types';
import { validateCitations } from './citations';

/**
 * Provider-agnostic text generation with automatic failover.
 *
 * We prefer Gemini for the synthesis/classification/conflict/follow-up phases,
 * but if the account is over quota (HTTP 429 / RESOURCE_EXHAUSTED) and the
 * caller supplied an OpenAI key, we transparently fall back to OpenAI so the
 * pipeline still completes (harness §5: not optional, but must degrade
 * gracefully). Both providers are called via raw `fetch` to match the existing
 * Exa/Tavily style and avoid pulling in an extra SDK.
 */
type GenOptions = {
  geminiKey: string;
  openaiKey?: string;
  model: string;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

function isQuotaError(err: unknown): boolean {
  if (err instanceof Error && /quota|429|RESOURCE_EXHAUSTED/i.test(err.message)) return true;
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status?: number }).status === 429;
  }
  return false;
}

async function callGeminiText(
  geminiKey: string,
  model: string,
  prompt: string,
  opts: { jsonMode?: boolean; signal?: AbortSignal }
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const result = await withRetry((signal) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: { abortSignal: signal ?? opts.signal, ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}) },
    })
  );
  return (result.text ?? '').trim();
}

async function callOpenAIText(
  openaiKey: string,
  model: string,
  prompt: string,
  opts: { jsonMode?: boolean; signal?: AbortSignal }
): Promise<string> {
  const response = await withRetry(async (signal) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: signal ?? opts.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<{ choices?: { message?: { content?: string } }[] }>;
  });
  return (response.choices?.[0]?.message?.content ?? '').trim();
}

/**
 * Generate text, preferring Gemini and falling back to OpenAI on quota errors.
 * Returns the raw model text (caller is responsible for JSON parsing).
 */
export async function generateText(prompt: string, opts: GenOptions): Promise<string> {
  try {
    return await callGeminiText(opts.geminiKey, opts.model, prompt, {
      jsonMode: opts.jsonMode,
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.openaiKey && isQuotaError(err)) {
      logger.warn('[ai-search] Gemini over quota, failing over to OpenAI', { error: err instanceof Error ? err.message : String(err) });
      return callOpenAIText(opts.openaiKey, getEnv().OPENAI_MODEL, prompt, {
        jsonMode: opts.jsonMode,
        signal: opts.signal,
      });
    }
    throw err;
  }
}


export class AISearchError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AISearchError';
    this.status = status;
  }
}


const TIER_1_DOMAINS = [
  'wiki.archlinux.org',
  'developer.mozilla.org',
  'docs.python.org',
  'learn.microsoft.com',
  'docs.oracle.com',
  'docs.rs',
  'doc.rust-lang.org',
  'go.dev',
  'reactjs.org',
  'nextjs.org',
  'nodejs.org',
  'kubernetes.io',
  'man7.org',
  'docs.docker.com',
  'tailwindcss.com',
  'vuejs.org',
  'svelte.dev',
  'angular.dev',
  'flutter.dev',
  'w3schools.com',
  'web.dev',
];

const TIER_2_DOMAINS = [
  'stackoverflow.com',
  'news.ycombinator.com',
  'github.com',
  'serverfault.com',
  'superuser.com',
  'askubuntu.com',
];

const TIER_3_DOMAINS = ['reddit.com', 'quora.com', 'lobste.rs'];


function getIncludeDomains(filter: SearchConfig['sourceFilter']): string[] | undefined {
  switch (filter) {
    case 'technical':
      return [
        'stackoverflow.com',
        'wiki.archlinux.org',
        'github.com',
        'developer.mozilla.org',
        'docs.python.org',
        'learn.microsoft.com',
      ];
    case 'reddit-hn':
      return ['reddit.com', 'news.ycombinator.com'];
    case 'docs':
      return [
        'wiki.archlinux.org',
        'developer.mozilla.org',
        'docs.python.org',
        'learn.microsoft.com',
        'docs.rs',
        'go.dev',
      ];
    case 'all':
    default:
      return undefined; // no filter
  }
}

function assignTier(domain: string): 1 | 2 | 3 | 4 {
  const d = domain.toLowerCase().replace(/^www\./, '');
  if (TIER_1_DOMAINS.some((t) => d.includes(t))) return 1;
  if (TIER_2_DOMAINS.some((t) => d.includes(t))) return 2;
  if (TIER_3_DOMAINS.some((t) => d.includes(t))) return 3;
  return 4;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function isOutdated(publishedDate?: string): boolean {
  if (!publishedDate) return false;
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return new Date(publishedDate) < twoYearsAgo;
}

async function classifyQuery(query: string, geminiKey: string, openaiKey?: string): Promise<QueryClassification> {
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const model = getEnv().GEMINI_LITE_MODEL;

  const prompt = `Classify this forum search query into ONE category:
- factual: has a single correct answer
- opinion: needs community consensus mapping
- technical: debugging/how-to/implementation
- comparison: comparing multiple options

Also identify:
- primaryDomain: 'programming' | 'devops' | 'general' | 'science' | 'design' | 'other'
- suggestedSources: array of best source domains to search
- searchTerms: 3 optimized search variants of the query
- isControversial: boolean

Query: "${query}"

Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.
Schema: { "type": string, "primaryDomain": string, "suggestedSources": string[], "searchTerms": string[], "isControversial": boolean }`;

  try {
    const text = await generateText(prompt, {
      geminiKey,
      openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
      model,
    });
    // Parse JSON, stripping any markdown code fences
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned) as QueryClassification;
  } catch (err) {
    logger.warn('[ai-search] classifyQuery failed, using fallback', { query, error: err });
    return {
      type: 'technical',
      primaryDomain: 'programming',
      suggestedSources: ['stackoverflow.com', 'github.com'],
      searchTerms: [query],
      isControversial: false,
    };
  }
}


async function searchWithExa(
  query: string,
  classification: QueryClassification,
  exaKey: string,
  config: SearchConfig
): Promise<Source[]> {
  try {
    const includeDomains = getIncludeDomains(config.sourceFilter);
    const searchTerms = classification.searchTerms;
    const searchQuery = searchTerms.length > 0 ? searchTerms[0] : query;

    const body: Record<string, unknown> = {
      query: searchQuery,
      type: config.exaMode === 'instant' ? 'keyword' : 'neural',
      numResults: 8,
      text: { maxCharacters: 8000 },
      useAutoprompt: true,
    };

    if (includeDomains) {
      body.includeDomains = includeDomains;
    }

    const data = await withRetry(async (signal) => {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': exaKey,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Exa API error: ${response.status}`);
      }

      return response.json();
    });
    const results = data.results || [];

    return results.map(
      (r: { id?: string; title?: string; url?: string; text?: string; publishedDate?: string }) => {
        const domain = extractDomain(r.url || '');
        const tier = assignTier(domain);
        return {
          id: r.id || uuidv4(),
          title: r.title || 'Untitled',
          url: r.url || '',
          domain,
          snippet: (r.text || '').substring(0, 300),
          text: r.text || '',
          publishedDate: r.publishedDate,
          tier,
          confidence: tier === 1 ? 90 : tier === 2 ? 75 : tier === 3 ? 60 : 45,
          isOutdated: isOutdated(r.publishedDate),
          provider: 'exa' as const,
          contentFetched: Boolean(r.text && r.text.trim().length > 0),
        };
      }
    );
  } catch (error) {
    logger.error('Exa search failed:', error);
    return [];
  }
}

async function searchWithTavily(
  query: string,
  classification: QueryClassification,
  tavilyKey: string,
  config: SearchConfig
): Promise<{ sources: Source[]; answer?: string }> {
  try {
    const includeDomains = getIncludeDomains(config.sourceFilter);
    const searchQuery =
      classification.searchTerms.length > 0 ? classification.searchTerms[0] : query;

    const body: Record<string, unknown> = {
      query: searchQuery,
      search_depth: config.tavilyMode === 'research' ? 'advanced' : 'basic',
      max_results: 6,
      include_answer: true,
    };

    if (includeDomains) {
      body.include_domains = includeDomains;
    }

    const data = await withRetry(async (signal) => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      return response.json();
    });
    const results = data.results || [];

    const sources: Source[] = results.map(
      (r: {
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
        score?: number;
      }) => {
        const domain = extractDomain(r.url || '');
        const tier = assignTier(domain);
        return {
          id: uuidv4(),
          title: r.title || 'Untitled',
          url: r.url || '',
          domain,
          snippet: (r.content || '').substring(0, 300),
          text: r.content || '',
          publishedDate: r.published_date,
          tier,
          confidence: Math.round((r.score || 0.5) * 100),
          isOutdated: isOutdated(r.published_date),
          provider: 'tavily' as const,
          contentFetched: Boolean(r.content && r.content.trim().length > 0),
        };
      }
    );

    return { sources, answer: data.answer };
  } catch (error) {
    logger.error('Tavily search failed:', error);
    return { sources: [] };
  }
}

async function searchSources(
  query: string,
  classification: QueryClassification,
  exaKey: string,
  tavilyKey: string,
  config: SearchConfig
): Promise<RawSearchResults> {
  const [exaResult, tavilyResult] = await Promise.allSettled([
    searchWithExa(query, classification, exaKey, config),
    searchWithTavily(query, classification, tavilyKey, config),
  ]);

  const exaSources = exaResult.status === 'fulfilled' ? exaResult.value : [];
  const tavilyData =
    tavilyResult.status === 'fulfilled' ? tavilyResult.value : { sources: [], answer: undefined };

  return {
    exaSources,
    tavilySources: tavilyData.sources,
    tavilyAnswer: tavilyData.answer,
  };
}


async function crossReference(
  rawResults: RawSearchResults,
  query: string,
  geminiKey: string,
  openaiKey?: string
): Promise<CrossRefResult> {
  const allSources = [...rawResults.exaSources, ...rawResults.tavilySources];

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allSources.filter((s) => {
    const normalized = s.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  // Sort by tier (ascending = better first), then confidence
  const ranked = deduped.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.confidence - a.confidence;
  });

  // Conflict detection via Gemini Flash
  let conflictData: ConflictInfo = {
    detected: false,
    description: '',
    sideA: '',
    sideB: '',
  };

  if (ranked.length >= 2) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const model = getEnv().GEMINI_LITE_MODEL;

      const sourceSummaries = ranked
        .slice(0, 8)
        .map((s) => `[${s.domain}]: ${s.snippet.substring(0, 200)}`)
        .join('\n');

      const conflictPrompt = `Review these ${ranked.length} sources about: "${query}"
${DATA_ONLY_INSTRUCTION}

Sources summary:
${wrapUserContent(sourceSummaries)}

Identify if there are genuine contradictions (not just different perspectives).
Return JSON: { "detected": boolean, "description": string, "sideA": string, "sideB": string }
Only flag real factual conflicts, not opinion differences.
No markdown, valid JSON only.`;

      const text = await generateText(conflictPrompt, {
        geminiKey,
        openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
        model,
      });
      const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
      conflictData = JSON.parse(cleaned) as ConflictInfo;
    } catch (err) {
      logger.warn('[ai-search] Conflict detection failed, continuing without it', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { rankedSources: ranked, conflictData };
}


interface StructuredSynthesis {
  text: string;
  citations: Citation[];
  queryType: QueryType;
  conflictData: ConflictInfo | null;
}

/**
 * Parse Gemini's structured synthesis output, validating the expected shape.
 * On any parse/validation failure, gracefully fall back to wrapping the raw
 * text as a citation-less synthesis rather than crashing — consistent with the
 * withRetry / graceful-degrade pattern used across this module.
 */
export function parseStructuredSynthesis(raw: string, sources: Source[]): StructuredSynthesis {
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<StructuredSynthesis>;

    if (typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
      throw new Error('Missing or empty text field');
    }

    const rawCitations: Citation[] = Array.isArray(parsed.citations)
      ? parsed.citations
          .filter(
            (c) =>
              typeof c?.marker === 'number' &&
              typeof c?.sourceId === 'string'
          )
          .map((c) => ({ marker: c.marker, sourceId: c.sourceId }))
      : [];

    const queryType: QueryType =
      parsed.queryType === 'factual' ||
      parsed.queryType === 'opinion' ||
      parsed.queryType === 'technical' ||
      parsed.queryType === 'comparison'
        ? parsed.queryType
        : 'technical';

    // Harness §2: self-validate citations against the actual text + sources.
    const { text, citations, overCitedSources } = validateCitations(
      parsed.text,
      rawCitations,
      sources
    );

    if (overCitedSources > 0) {
      logger.warn('[ai-search] Citation reuse over cap', { overCitedSources });
    }

    return {
      text,
      citations,
      queryType,
      conflictData: parsed.conflictData ?? null,
    };
  } catch (err) {
    logger.warn('[ai-search] Structured synthesis parse failed, falling back to raw text', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      text: raw,
      citations: [],
      queryType: 'technical',
      conflictData: null,
    };
  }
}

async function synthesize(
  query: string,
  sources: Source[],
  classification: QueryClassification,
  conflictData: ConflictInfo,
  geminiKey: string,
  tavilyAnswer?: string,
  openaiKey?: string
): Promise<SynthesisResult> {
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const model = getEnv().GEMINI_SEARCH_MODEL;

  // Only feed sources whose full content was actually fetched (harness §8).
  const citableSources = sources.filter((s) => s.contentFetched !== false);

  const sourcesText = citableSources
    .slice(0, 8)
    .map(
      (s, i) =>
        `SOURCE ${i + 1} [id=${s.id}] [Tier ${s.tier}] [${s.domain}] [${s.publishedDate || 'unknown date'}]:\n${s.text.substring(0, 1000)}`
    )
    .join('\n---\n');

  const synthesisPrompt = `You are a knowledge synthesis engine for a developer forum.
${DATA_ONLY_INSTRUCTION}

Query: "${query}"
Query type: ${classification.type}
${tavilyAnswer ? `Quick pre-answer from Tavily: ${wrapUserContent(tavilyAnswer)}` : ''}

Sources (ranked by trust tier):
${wrapUserContent(sourcesText)}

Produce a synthesis and respond with ONLY valid JSON — no markdown, no code fences, no prose wrapper.
Schema:
{
  "text": string,
  "citations": [{ "marker": number, "sourceId": string }],
  "queryType": "factual" | "opinion" | "technical" | "comparison",
  "conflictData": null | { "detected": boolean, "description": string, "sideA": string, "sideB": string }
}

STRICT rules:
1. "text" is the answer prose with inline markers like [1], [2] placed IMMEDIATELY after the specific claim each supports. Each marker must correspond to a source by its [id=...] from the sources above.
2. "citations" maps each numeric marker to the exact sourceId (use the id from SOURCE n above). Marker numbers must start at 1 and be contiguous.
3. Every factual claim must carry an inline marker. If a claim is not supported by any source, do not invent a marker.
4. Structure the prose: a 2-3 sentence Quick Answer, then Community Consensus, then Critical Points / gotchas.
5. If query type is "comparison", include a Verdict section with a clear recommendation.
6. Max 400 words total. Light markdown (bold, bullets) is allowed. No headers with #.
7. Set "conflictData" to a detected conflict object only if sources genuinely contradict each other (not mere opinion differences); otherwise null.
${conflictData.detected ? `NOTE: A conflict was already detected — ${conflictData.description}. Reflect it in conflictData and acknowledge it transparently in the prose.` : ''}

IMPORTANT:
- Do NOT hallucinate. Only state what sources explicitly say.
- If sources conflict, acknowledge it — don't pick a side without evidence.
- Freshness matters: prefer recent sources for fast-moving topics.`;

  try {
    const content = await generateText(synthesisPrompt, {
      geminiKey,
      openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
      model,
      jsonMode: true,
    });

    if (!content) {
      throw new AISearchError('Synthesis produced no content from the model.', 502);
    }

    const parsed = parseStructuredSynthesis(content, sources);

    return {
      content: parsed.text,
      text: parsed.text,
      citations: parsed.citations,
      queryType: parsed.queryType,
      sourceCount: sources.length,
      conflictData: parsed.conflictData ?? conflictData,
      processingTimeMs: 0, // Calculated by caller
    };
  } catch (error) {
    logger.error('Synthesis failed:', error);
    const status =
      error instanceof Error && 'status' in error
        ? (error as { status?: number }).status ?? 502
        : 502;
    const isQuota =
      status === 429 ||
      (error instanceof Error && /quota|429|RESOURCE_EXHAUSTED/i.test(error.message));
    throw new AISearchError(
      isQuota
        ? 'The AI provider is temporarily over quota. Please try again later.'
        : 'Synthesis failed due to an AI provider error. Please try again.',
      isQuota ? 503 : status
    );
  }
}

/**
 * Generate 3 scoped follow-up questions based on the Q&A pair. Used after
 * synthesis completes so the client can offer refinement chips.
 */
async function generateFollowUps(
  query: string,
  synthesisText: string,
  geminiKey: string,
  openaiKey?: string
): Promise<string[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = getEnv().GEMINI_LITE_MODEL;

    const prompt = `Given this search query and its synthesized answer, propose exactly 3 scoped follow-up questions a developer would naturally ask next. Each should be specific, self-contained, and build on the prior answer.

Query: "${query}"
Answer: ${synthesisText.substring(0, 1500)}

Respond ONLY with valid JSON: { "followUps": string[] } (exactly 3 strings).
No markdown, no code fences.`;

    const text = await generateText(prompt, {
      geminiKey,
      openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
      model,
      jsonMode: true,
    });
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { followUps?: unknown };
    if (Array.isArray(parsed.followUps)) {
      const items = parsed.followUps
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .slice(0, 3);
      if (items.length > 0) return items;
    }
    return [];
  } catch (err) {
    logger.warn('[ai-search] Follow-up generation failed, returning none', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}


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
  keys: { exa: string; tavily: string; gemini: string; openai?: string }
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

  // Phase 3: Cross-reference
  const t2 = Date.now();
  const crossRefResult = await crossReference(rawResults, query, keys.gemini, keys.openai);
  const crossrefMs = Date.now() - t2;

  const rankedSources = crossRefResult.rankedSources;

  // Weak-results branch: not enough quality sources to synthesize confidently.
  const qualitySourceCount = rankedSources.filter((s) => s.tier <= 3).length;
  if (qualitySourceCount < 2) {
    return {
      synthesis: {
        content: '',
        queryType: classification.type,
        sourceCount: rankedSources.length,
        conflictData: crossRefResult.conflictData,
        processingTimeMs: Date.now() - startTime,
      },
      sources: rankedSources,
      phase: 'refine',
      followUps: [],
      timings: { classifyMs, searchMs, crossrefMs, synthesizeMs: 0, provider: phaseProviderLabel(config) },
    };
  }

  // Phase 4: Synthesize (skip if instant mode)
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
      keys.openai
    );
    synthesis.processingTimeMs = Date.now() - startTime;
  }
  const synthesizeMs = Date.now() - t3;

  // Phase 5: Follow-ups (only for full synthesis mode)
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
