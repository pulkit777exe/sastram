import { GoogleGenAI } from '@google/genai';
import { withRetry } from '@/lib/utils/retry';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import type { QueryClassification } from './types';

type GenOptions = {
  geminiKey: string;
  openaiKey?: string;
  model: string;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

function isQuotaError(err: unknown): boolean {
  if (err instanceof Error) {
    const messageLower = err.message.toLowerCase();
    if (messageLower.includes('quota')) return true;
    if (messageLower.includes('429')) return true;
    if (messageLower.includes('resource_exhausted')) return true;
  }
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status?: number }).status === 429;
  }
  return false;
}

function buildOpenAiBody(model: string, prompt: string, jsonMode?: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

async function callGeminiText(
  geminiKey: string,
  model: string,
  prompt: string,
  opts: { jsonMode?: boolean; signal?: AbortSignal }
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  const result = await withRetry((signal) => {
    const generationConfig: Record<string, unknown> = {
      abortSignal: signal ?? opts.signal,
    };
    if (opts.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    return ai.models.generateContent({
      model,
      contents: prompt,
      config: generationConfig as never,
    });
  });
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
      body: JSON.stringify(buildOpenAiBody(model, prompt, opts.jsonMode)),
      signal: signal ?? opts.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<{ choices?: { message?: { content?: string } }[] }>;
  });
  return (response.choices?.[0]?.message?.content ?? '').trim();
}

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

export async function classifyQuery(query: string, geminiKey: string, openaiKey?: string): Promise<QueryClassification> {
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
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned) as QueryClassification;
  } catch (err) {
    logger.warn('[ai-search] classifyQuery failed, using technical fallback', {
      query,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      type: 'technical',
      primaryDomain: 'programming',
      suggestedSources: ['stackoverflow.com', 'github.com'],
      searchTerms: [query],
      isControversial: false,
    };
  }
}
