import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/ai/prompt-boundary';
import type {
  Source,
  ConflictInfo,
  QueryClassification,
  CrossRefResult,
  SynthesisResult,
  QueryType,
  Citation,
} from './types';
import { validateCitations } from './citations';
import { generateText } from './llm';

export class AISearchError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AISearchError';
    this.status = status;
  }
}

export async function crossReference(
  rawResults: { exaSources: Source[]; tavilySources: Source[] },
  query: string,
  geminiKey: string,
  openaiKey?: string
): Promise<CrossRefResult> {
  const allSources = [...rawResults.exaSources, ...rawResults.tavilySources];

  const seen = new Set<string>();
  const deduped = allSources.filter((s) => {
    const normalized = s.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const ranked = deduped.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.confidence - a.confidence;
  });

  let conflictData: ConflictInfo = {
    detected: false,
    description: '',
    sideA: '',
    sideB: '',
  };

  if (ranked.length >= 2) {
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

    try {
      const text = await generateText(conflictPrompt, {
        geminiKey,
        openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
        model: getEnv().GEMINI_LITE_MODEL,
      });
      const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
      conflictData = JSON.parse(cleaned) as ConflictInfo;
    } catch (err) {
      logger.warn('[ai-search] Conflict detection failed, continuing without it', {
        error: err instanceof Error ? err.message : String(err),
      });
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

export async function synthesize(
  query: string,
  sources: Source[],
  classification: QueryClassification,
  conflictData: ConflictInfo,
  geminiKey: string,
  tavilyAnswer?: string,
  openaiKey?: string
): Promise<SynthesisResult> {
  const model = getEnv().GEMINI_SEARCH_MODEL;

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
      processingTimeMs: 0,
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

export async function generateFollowUps(
  query: string,
  synthesisText: string,
  geminiKey: string,
  openaiKey?: string
): Promise<string[]> {
  const prompt = `Given this search query and its synthesized answer, propose exactly 3 scoped follow-up questions a developer would naturally ask next. Each should be specific, self-contained, and build on the prior answer.

Query: "${query}"
Answer: ${synthesisText.substring(0, 1500)}

Respond ONLY with valid JSON: { "followUps": string[] } (exactly 3 strings).
No markdown, no code fences.`;

  try {
    const text = await generateText(prompt, {
      geminiKey,
      openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
      model: getEnv().GEMINI_LITE_MODEL,
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
