import { GoogleGenAI } from '@google/genai';
import { withRetry } from '@/lib/utils/retry';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import { isQuotaError } from '@/lib/utils/errors';
import { logAiUsage } from '@/lib/services/ai-usage-logger';
import type { LlmAdapter } from '@/modules/ai-search/ports';

/** Keyed options for generateText — kept so existing callers/tests keep compiling. */
export interface GenOptions {
  geminiKey: string;
  openaiKey?: string;
  model: string;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface KeyedLlmKeys {
  gemini: string;
  openai?: string;
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
  const start = Date.now();

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

  logAiUsage({
    operation: 'ai-search:generate-text',
    provider: 'gemini',
    model,
    inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
    latencyMs: Date.now() - start,
  }).catch((e) => logger.warn('[ai-search] usage log failed', { error: e }));

  return (result.text ?? '').trim();
}

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callOpenAIText(
  openaiKey: string,
  model: string,
  prompt: string,
  opts: { jsonMode?: boolean; signal?: AbortSignal }
): Promise<string> {
  const start = Date.now();

  const response = (await withRetry(async (signal) => {
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
    return res.json() as Promise<OpenAiChatResponse>;
  })) as OpenAiChatResponse;

  logAiUsage({
    operation: 'ai-search:generate-text',
    provider: 'openai',
    model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - start,
  }).catch((e) => logger.warn('[ai-search] usage log failed', { error: e }));

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

/**
 * Read an HTTP-ish status off a thrown provider error. Shared here so
 * ai-search phases don't each keep a local copy.
 */
export function getErrorStatus(error: unknown, fallback = 502): number {
  if (error instanceof Error && 'status' in error) {
    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === 'number') {
      return maybeStatus;
    }
  }
  return fallback;
}

/**
 * Build the pipeline LLM adapter from raw keys. The OpenAI key falls back to
 * env at call time, matching the old per-phase `openaiKey ?? getEnv()` default.
 */
export function createKeyedLlm(keys: KeyedLlmKeys): LlmAdapter {
  return {
    generateText: (prompt, opts) =>
      generateText(prompt, {
        geminiKey: keys.gemini,
        openaiKey: keys.openai ?? getEnv().OPENAI_API_KEY,
        model: opts?.model ?? getEnv().GEMINI_LITE_MODEL,
        jsonMode: opts?.jsonMode,
        signal: opts?.signal,
      }),
  };
}
