import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { withRetry } from '@/lib/utils/retry';
import type {
  SearchConfig,
  QueryClassification,
  Source,
  ConflictInfo,
  RawSearchResults,
  CrossRefResult,
  SynthesisResult,
  AISearchResponse,
} from './types';

// ── Domain Tiers ────────────────────────────────────────────
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

// ── Source Filters ──────────────────────────────────────────
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

// ── Phase 1: Query Classification ───────────────────────────
async function classifyQuery(query: string, geminiKey: string): Promise<QueryClassification> {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

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
    const result = await withRetry((signal) =>
      model.generateContent(prompt, { signal, timeout: 15_000 })
    );
    const text = result.response.text().trim();
    // Parse JSON, stripping any markdown code fences
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned) as QueryClassification;
  } catch {
    // Fallback classification
    return {
      type: 'technical',
      primaryDomain: 'programming',
      suggestedSources: ['stackoverflow.com', 'github.com'],
      searchTerms: [query],
      isControversial: false,
    };
  }
}

// ── Phase 2: Parallel Search ────────────────────────────────
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
        };
      }
    );
  } catch (error) {
    console.error('Exa search failed:', error);
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
        };
      }
    );

    return { sources, answer: data.answer };
  } catch (error) {
    console.error('Tavily search failed:', error);
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

// ── Phase 3: Cross-Reference & Conflict Detection ──────────
async function crossReference(
  rawResults: RawSearchResults,
  query: string,
  geminiKey: string
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
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-lite',
      });

      const sourceSummaries = ranked
        .slice(0, 8)
        .map((s) => `[${s.domain}]: ${s.snippet.substring(0, 200)}`)
        .join('\n');

      const conflictPrompt = `Review these ${ranked.length} sources about: "${query}"

Sources summary:
${sourceSummaries}

Identify if there are genuine contradictions (not just different perspectives).
Return JSON: { "detected": boolean, "description": string, "sideA": string, "sideB": string }
Only flag real factual conflicts, not opinion differences.
No markdown, valid JSON only.`;

      const result = await withRetry((signal) =>
        model.generateContent(conflictPrompt, { signal, timeout: 15_000 })
      );
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
      conflictData = JSON.parse(cleaned) as ConflictInfo;
    } catch {
      // Conflict detection is non-critical, continue without it
    }
  }

  return { rankedSources: ranked, conflictData };
}

// ── Phase 4: Synthesis ──────────────────────────────────────
async function synthesize(
  query: string,
  sources: Source[],
  classification: QueryClassification,
  conflictData: ConflictInfo,
  geminiKey: string,
  tavilyAnswer?: string
): Promise<SynthesisResult> {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const sourcesText = sources
    .slice(0, 8)
    .map(
      (s, i) =>
        `SOURCE ${i + 1} [Tier ${s.tier}] [${s.domain}] [${s.publishedDate || 'unknown date'}]:
${s.text.substring(0, 1000)}`
    )
    .join('\n---\n');

  const synthesisPrompt = `You are a knowledge synthesis engine for a developer forum.

Query: "${query}"
Query type: ${classification.type}
${tavilyAnswer ? `Quick pre-answer from Tavily: ${tavilyAnswer}` : ''}

Sources (ranked by trust tier):
${sourcesText}

Generate a structured synthesis following these STRICT rules:
1. Quick Answer: 2-3 sentences. Direct. No hedging.
2. Community Consensus: What do most sources agree on? Use specific source references.
3. Critical Points: Edge cases, warnings, gotchas. Things most answers miss.
4. If query is 'comparison': add a Verdict section with clear recommendation.
5. Mark any information from Tier 3-4 sources with [community] tag.
6. Mark information from Tier 1 sources with [official] tag.

${conflictData.detected ? `NOTE: There is a detected conflict — ${conflictData.description}. Acknowledge this transparently.` : ''}

IMPORTANT:
- Do NOT hallucinate. Only state what sources explicitly say.
- If sources conflict, acknowledge it — don't pick a side without evidence.
- Freshness matters: prefer recent sources for fast-moving topics.
- Max 400 words total.

Return plain text with light markdown (bold, bullets only). No headers with #.`;

  try {
    const result = await withRetry((signal) =>
      model.generateContent(synthesisPrompt, { signal, timeout: 15_000 })
    );
    const content = result.response.text().trim();

    // Calculate confidence score
    let confidence = 50;
    for (const s of sources.slice(0, 8)) {
      if (s.tier === 1) confidence += 10;
      else if (s.tier === 2) confidence += 5;
    }
    // Agreement bonus
    if (!conflictData.detected && sources.length > 2) confidence += 5;
    // Conflict penalty
    if (conflictData.detected) confidence -= 10;
    // Outdated penalty
    if (sources.every((s) => s.isOutdated)) confidence -= 15;
    // Cap
    confidence = Math.min(98, Math.max(10, confidence));

    return {
      content,
      confidence,
      queryType: classification.type,
      sourceCount: sources.length,
      conflictData,
      processingTimeMs: 0, // Calculated by caller
    };
  } catch (error) {
    console.error('Synthesis failed:', error);
    return {
      content: tavilyAnswer || 'Synthesis failed. Please check your Gemini API key and try again.',
      confidence: tavilyAnswer ? 40 : 0,
      queryType: classification.type,
      sourceCount: sources.length,
      conflictData,
      processingTimeMs: 0,
    };
  }
}

// ── Main Pipeline ───────────────────────────────────────────
export async function executeAISearch(
  query: string,
  config: SearchConfig,
  keys: { exa: string; tavily: string; gemini: string }
): Promise<AISearchResponse> {
  const startTime = Date.now();

  // Phase 1: Classify
  const classification = await classifyQuery(query, keys.gemini);

  // Phase 2: Search (skip Tavily if instant mode)
  let rawResults: RawSearchResults;
  if (config.searchMode === 'instant') {
    const exaSources = await searchWithExa(query, classification, keys.exa, config);
    rawResults = { exaSources, tavilySources: [], tavilyAnswer: undefined };
  } else {
    rawResults = await searchSources(query, classification, keys.exa, keys.tavily, config);
  }

  // Phase 3: Cross-reference
  const crossRefResult = await crossReference(rawResults, query, keys.gemini);

  // Phase 4: Synthesize (skip if instant mode)
  let synthesis: SynthesisResult;
  if (config.searchMode === 'instant') {
    synthesis = {
      content: rawResults.tavilyAnswer || 'Instant mode — showing raw results only.',
      confidence: 50,
      queryType: classification.type,
      sourceCount: crossRefResult.rankedSources.length,
      conflictData: crossRefResult.conflictData,
      processingTimeMs: Date.now() - startTime,
    };
  } else {
    synthesis = await synthesize(
      query,
      crossRefResult.rankedSources,
      classification,
      crossRefResult.conflictData,
      keys.gemini,
      rawResults.tavilyAnswer
    );
    synthesis.processingTimeMs = Date.now() - startTime;
  }

  return {
    synthesis,
    sources: crossRefResult.rankedSources,
    phase: 'done',
  };
}
