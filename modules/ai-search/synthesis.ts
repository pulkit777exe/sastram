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

// Shared fence-stripping for LLM JSON outputs. Models sometimes wrap JSON in ```json fences.
const CODE_FENCE_RE = /```json\n?|```\n?/g;

function stripFences(raw: string): string {
  return raw.replace(CODE_FENCE_RE, '').trim();
}

const VALID_QUERY_TYPES = new Set<QueryType>(['factual', 'opinion', 'technical', 'comparison']);

function isQuotaError(error: unknown, status: number): boolean {
  if (status === 429) {
    return true;
  }
  if (error instanceof Error && /quota|429|RESOURCE_EXHAUSTED/i.test(error.message)) {
    return true;
  }
  return false;
}

function getErrorStatus(error: unknown, fallback = 502): number {
  if (error instanceof Error && 'status' in error) {
    const maybeStatus = (error as { status?: number }).status;
    if (maybeStatus !== undefined && maybeStatus !== null) {
      return maybeStatus;
    }
  }
  return fallback;
}

function compareSourcesByTierAndConfidence(a: Source, b: Source): number {
  if (a.tier !== b.tier) {
    return a.tier - b.tier;
  }
  return b.confidence - a.confidence;
}

function mergeAllSources(rawResults: { exaSources: Source[]; tavilySources: Source[] }): Source[] {
  return [...rawResults.exaSources, ...rawResults.tavilySources];
}

function dedupByUrl(sources: Source[]): Source[] {
  const deduped: Source[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const normalized = s.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(s);
  }
  return deduped;
}

function pickTopSources(ranked: Source[], limit = 8): Source[] {
  return ranked.slice(0, Math.min(limit, ranked.length));
}

async function detectConflictFromSources(
  ranked: Source[],
  query: string,
  geminiKey: string,
  openaiKey?: string
): Promise<ConflictInfo> {
  const emptyConflict: ConflictInfo = { detected: false, description: '', sideA: '', sideB: '' };
  if (ranked.length < 2) return emptyConflict;
  const topSources = pickTopSources(ranked, 8);
  const sourceSummaries = topSources.map((s) => `[${s.domain}]: ${s.snippet.substring(0, 200)}`).join('\n');
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
    const cleaned = stripFences(text);
    return JSON.parse(cleaned) as ConflictInfo;
  } catch (err) {
    logger.warn('[ai-search] Conflict detection failed, continuing without it', {
      error: err instanceof Error ? err.message : String(err),
    });
    return emptyConflict;
  }
}

export async function crossReference(
  rawResults: { exaSources: Source[]; tavilySources: Source[] },
  query: string,
  geminiKey: string,
  openaiKey?: string
): Promise<CrossRefResult> {
  const allSources = mergeAllSources(rawResults);
  const deduped = dedupByUrl(allSources);
  deduped.sort(compareSourcesByTierAndConfidence);
  const ranked = deduped;
  const conflictData = await detectConflictFromSources(ranked, query, geminiKey, openaiKey);
  return { rankedSources: ranked, conflictData };
}

interface StructuredSynthesis {
  text: string;
  citations: Citation[];
  queryType: QueryType;
  conflictData: ConflictInfo | null;
}

export function parseStructuredSynthesis(raw: string, sources: Source[]): StructuredSynthesis {
  const cleaned = stripFences(raw);

  try {
    const parsed = JSON.parse(cleaned) as Partial<StructuredSynthesis>;

    if (typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
      throw new Error('Missing or empty text field');
    }

    const rawCitations: Citation[] = [];
    if (Array.isArray(parsed.citations)) {
      for (const c of parsed.citations) {
        if (typeof c?.marker !== 'number') {
          continue;
        }
        if (typeof c?.sourceId !== 'string') {
          continue;
        }
        rawCitations.push({ marker: c.marker, sourceId: c.sourceId });
      }
    }

    const queryType: QueryType = VALID_QUERY_TYPES.has(parsed.queryType as QueryType)
      ? (parsed.queryType as QueryType)
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

function collectCitableSources(sources: Source[]): Source[] {
  return sources.filter((s) => s.contentFetched !== false);
}

function formatSourceEntries(citableSources: Source[]): string {
  const sourceEntries = pickTopSources(citableSources, 8).map((s, i) => {
    const dateLabel = s.publishedDate ?? 'unknown date';
    return `SOURCE ${i + 1} [id=${s.id}] [Tier ${s.tier}] [${s.domain}] [${dateLabel}]:\n${s.text.substring(0, 1000)}`;
  });
  return sourceEntries.join('\n---\n');
}

function buildHistoryBlock(conversationHistory?: { role: string; content: string }[]): string {
  if (!conversationHistory?.length) return '';
  const historyLines = conversationHistory.map((m) => `${m.role}: ${m.content.substring(0, 500)}`);
  return `\n\nConversation history (for context only — synthesize the NEW query using the sources below):\n${historyLines.join('\n')}\n`;
}

function buildTavilyBlock(tavilyAnswer?: string): string {
  if (!tavilyAnswer) return '';
  return `Quick pre-answer from Tavily: ${wrapUserContent(tavilyAnswer)}`;
}

function buildConflictNote(conflictData: ConflictInfo): string {
  if (!conflictData.detected) return '';
  return `NOTE: A conflict was already detected — ${conflictData.description}. Reflect it in conflictData and acknowledge it transparently in the prose.`;
}

export async function synthesize(
  query: string,
  sources: Source[],
  classification: QueryClassification,
  conflictData: ConflictInfo,
  geminiKey: string,
  tavilyAnswer?: string,
  openaiKey?: string,
  conversationHistory?: { role: string; content: string }[],
  expertiseLevel?: string
): Promise<SynthesisResult> {
  const model = getEnv().GEMINI_SEARCH_MODEL;

  const citableSources = collectCitableSources(sources);
  const sourcesText = formatSourceEntries(citableSources);
  const historyBlock = buildHistoryBlock(conversationHistory);
  const tavilyBlock = buildTavilyBlock(tavilyAnswer);
  const conflictNote = buildConflictNote(conflictData);

  const expertiseLine = expertiseLevel ? `User expertise: ${expertiseLevel} — adjust depth (beginner: ELI5 with analogies, expert: concise technical, no hand-holding).` : '';
  const synthesisPrompt = `You are a knowledge synthesis engine for a developer forum.
${DATA_ONLY_INSTRUCTION}

Query: "${query}"
Query type: ${classification.type}
${expertiseLine}
${tavilyBlock}
${historyBlock}
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
${conflictNote}

IMPORTANT:
- Do NOT hallucinate. Only state what sources explicitly say.
- If sources conflict, acknowledge it — don't pick a side without evidence.
- Freshness matters: prefer recent sources for fast-moving topics.
- If conversation history is provided, use it to understand context but always synthesize from the NEW sources.
- If fewer than 2 quality sources are available, be transparent about this in your response. State what you found and note the limited source base. Do not fabricate additional sources or claims.`;

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

    const status = getErrorStatus(error, 502);
    const isQuota = isQuotaError(error, status);

    let message: string;
    let errorStatus: number;
    if (isQuota) {
      message = 'The AI provider is temporarily over quota. Please try again later.';
      errorStatus = 503;
    } else {
      message = 'Synthesis failed due to an AI provider error. Please try again.';
      errorStatus = status;
    }

    throw new AISearchError(message, errorStatus);
  }
}

export async function generateFollowUps(
  query: string,
  synthesisText: string,
  geminiKey: string,
  openaiKey?: string
): Promise<string[]> {
  const answerPreview = synthesisText.substring(0, 1500);

  const prompt = `Given this search query and its synthesized answer, propose exactly 3 scoped follow-up questions a developer would naturally ask next. Each should be specific, self-contained, and build on the prior answer.

Query: "${query}"
Answer: ${answerPreview}

Respond ONLY with valid JSON: { "followUps": string[] } (exactly 3 strings).
No markdown, no code fences.`;

  try {
    const text = await generateText(prompt, {
      geminiKey,
      openaiKey: openaiKey ?? getEnv().OPENAI_API_KEY,
      model: getEnv().GEMINI_LITE_MODEL,
      jsonMode: true,
    });
    const cleaned = stripFences(text);
    const parsed = JSON.parse(cleaned) as { followUps?: unknown };
    if (Array.isArray(parsed.followUps)) {
      const validItems: string[] = [];
      for (const f of parsed.followUps) {
        if (typeof f !== 'string') {
          continue;
        }
        const trimmed = f.trim();
        if (trimmed.length === 0) {
          continue;
        }
        validItems.push(trimmed);
        if (validItems.length >= 3) {
          break;
        }
      }
      if (validItems.length > 0) {
        return validItems;
      }
    }
    return [];
  } catch (err) {
    logger.warn('[ai-search] Follow-up generation failed, returning none', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
