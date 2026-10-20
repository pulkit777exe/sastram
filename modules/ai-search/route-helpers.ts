import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeSearchQuery, validateApiKeys } from '@/modules/ai-search/sanitize';
import { readThroughCache, type AISearchPipelineResult } from '@/modules/ai-search/service';
import { AISearchError } from '@/modules/ai-search/synthesis';
import { prismaSearchStore } from '@/modules/ai-search/cache';
import { consumeIdempotencyKey } from '@/lib/services/idempotency';
import { env } from '@/lib/config/env';
import { sseChunk, blockedStream, sseHeaders } from '@/lib/utils/sse';

export const QUERY_MIN = 3;
export const QUERY_MAX = 500;

export const searchRequestSchema = z.object({
  query: z
    .string()
    .min(QUERY_MIN, `Query must be at least ${QUERY_MIN} characters`)
    .max(QUERY_MAX, `Query must be at most ${QUERY_MAX} characters`)
    .transform(sanitizeSearchQuery),
  keys: z
    .object({
      exa: z.string().min(1).optional(),
      tavily: z.string().min(1).optional(),
      gemini: z.string().min(1).optional(),
      openai: z.string().min(1).optional(),
    })
    .strict()
    .optional()
    .default({}),
  config: z.object({
    exaMode: z.enum(['agentic', 'instant', 'websets']),
    tavilyMode: z.enum(['search', 'extract', 'crawl', 'research']),
    sourceFilter: z.enum(['all', 'technical', 'reddit-hn', 'docs']),
    searchMode: z.enum(['standard', 'instant', 'table']),
  }),
  sessionId: z.string().uuid().optional(),
  clientNonce: z.string().min(8).max(64).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(20)
    .optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type SSEEvent =
  | { phase: 'searching' }
  | { phase: 'reading'; sources: AISearchPipelineResult['sources'] }
  | { phase: 'crossref' }
  | { phase: 'synthesizing' }
  | { phase: 'done'; synthesis: AISearchPipelineResult['synthesis']; followUps: string[]; sessionId?: string; sources?: AISearchPipelineResult['sources'] }
  | { phase: 'blocked'; message: string }
  | { phase: 'error'; message: string; errorCode?: string };

export function deriveTitle(query: string): string {
  const words = query.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6);
  const t = words.join(' ');
  return t.length > 60 ? `${t.substring(0, 57)}…` : t;
}

export function validateContentType(request: { headers: { get(name: string): string | null } }): NextResponse | null {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(fail('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'), {
      status: HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return null;
}

export async function parseSearchJsonBody(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError('Invalid JSON in request body', 'VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST);
  }
}

/** Schema validation — throws VALIDATION_ERROR (400) via the route's error mapper. */
export function validateSearchBody(body: unknown): SearchRequest {
  const validation = searchRequestSchema.safeParse(body);
  if (!validation.success) {
    throw new AppError(
      validation.error.issues[0]?.message || 'Invalid request parameters',
      'VALIDATION_ERROR',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return validation.data;
}

export interface KeyFallbacks {
  exa?: string;
  tavily?: string;
  gemini?: string;
  openai?: string;
}

function defaultFallbacks(): KeyFallbacks {
  return {
    exa: env.SASTRAM_EXA_KEY,
    tavily: env.SASTRAM_TAVILY_KEY,
    gemini: env.SASTRAM_GEMINI_KEY,
    openai: env.OPENAI_API_KEY,
  };
}

export function resolveApiKeys(keys: SearchRequest['keys'], fallbacks: KeyFallbacks = defaultFallbacks()) {
  return {
    exaKey: keys.exa || fallbacks.exa || '',
    tavilyKey: keys.tavily || fallbacks.tavily || '',
    geminiKey: keys.gemini || fallbacks.gemini || '',
    openaiKey: keys.openai || fallbacks.openai || '',
  };
}

export type ResolvedKeys = ReturnType<typeof resolveApiKeys>;

export interface MissingApiKey {
  provider: 'exa' | 'tavily' | 'gemini';
  label: string;
  envVar: string;
}

export function missingApiKeys(keys: ResolvedKeys): MissingApiKey[] {
  const missing: MissingApiKey[] = [];
  if (!keys.exaKey) missing.push({ provider: 'exa', label: 'Exa', envVar: 'SASTRAM_EXA_KEY' });
  if (!keys.tavilyKey) missing.push({ provider: 'tavily', label: 'Tavily', envVar: 'SASTRAM_TAVILY_KEY' });
  if (!keys.geminiKey) missing.push({ provider: 'gemini', label: 'Gemini', envVar: 'SASTRAM_GEMINI_KEY' });
  return missing;
}

/** Null when all present, else the exact 400 message the route used to inline. */
export function missingKeysMessage(keys: ResolvedKeys): string | null {
  const missing = missingApiKeys(keys);
  if (missing.length === 0) return null;
  return `Missing API key${missing.length > 1 ? 's' : ''}: ${missing.map((key) => key.label).join(', ')}. Configure in API Keys settings.`;
}

/**
 * Structured 400 so the client can open the key dialog, keep the user's query,
 * and retry automatically once the missing keys are supplied.
 */
export function missingKeysResponse(keys: ResolvedKeys): NextResponse | null {
  const missingKeys = missingApiKeys(keys);
  const message = missingKeysMessage(keys);
  if (missingKeys.length === 0 || !message) return null;
  return NextResponse.json(fail('MISSING_API_KEYS', message, { missingKeys }), {
    status: HTTP_STATUS.BAD_REQUEST,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Null when formats pass, else the exact 400 message the route used to inline. */
export function invalidApiKeys(keys: ResolvedKeys): Array<{ provider: 'exa' | 'tavily' | 'gemini'; label: string }> {
  const keyValidation = validateApiKeys({
    exa: keys.exaKey,
    tavily: keys.tavilyKey,
    gemini: keys.geminiKey,
  });
  const invalid: Array<{ provider: 'exa' | 'tavily' | 'gemini'; label: string }> = [];
  if (!keyValidation.exaValid) invalid.push({ provider: 'exa', label: 'Exa' });
  if (!keyValidation.tavilyValid) invalid.push({ provider: 'tavily', label: 'Tavily' });
  if (!keyValidation.geminiValid) invalid.push({ provider: 'gemini', label: 'Gemini' });
  return invalid;
}

export function invalidKeysMessage(keys: ResolvedKeys): string | null {
  const invalid = invalidApiKeys(keys);
  if (invalid.length === 0) return null;
  return `Invalid API key format for: ${invalid.map((key) => key.label).join(', ')}. Please check your keys.`;
}

/** Structured 400 that opens the key dialog and retries the pending query. */
export function invalidKeysResponse(keys: ResolvedKeys): NextResponse | null {
  const invalidKeys = invalidApiKeys(keys);
  const message = invalidKeysMessage(keys);
  if (invalidKeys.length === 0 || !message) return null;
  return NextResponse.json(fail('INVALID_API_KEYS', message, { invalidKeys }), {
    status: HTTP_STATUS.BAD_REQUEST,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function checkSearchIdempotency(
  clientNonce: string | undefined,
  userId?: string
): Promise<ReturnType<typeof blockedStream> | null> {
  if (!clientNonce) return null;
  const key = userId ? `ai-search:nonce:${userId}:${clientNonce}` : `ai-search:nonce:${clientNonce}`;
  const ok = await consumeIdempotencyKey(key);
  if (!ok) {
    return blockedStream('This search was already submitted.');
  }
  return null;
}

export async function tryGetCachedResult(
  query: string,
  expertiseLevel?: string
): Promise<AISearchPipelineResult | null> {
  // Single read path (shared with the pipeline): expertise-keyed, normalized.
  return readThroughCache(prismaSearchStore(), query, expertiseLevel);
}

export function buildCachedStream(cached: AISearchPipelineResult): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (event: SSEEvent) => controller.enqueue(encoder.encode(sseChunk(event)));
      sendEvent({ phase: 'searching' });
      sendEvent({ phase: 'reading', sources: cached.sources });
      sendEvent({ phase: 'crossref' });
      sendEvent({ phase: 'synthesizing' });
      sendEvent({
        phase: 'done',
        synthesis: { ...cached.synthesis, cachedAt: cached.synthesis.cachedAt },
        followUps: (cached as AISearchPipelineResult).followUps ?? [],
        sources: cached.sources,
      });
      controller.close();
    },
  });
  return new Response(stream, {
    status: HTTP_STATUS.OK,
    headers: { ...sseHeaders(), 'X-Cache': 'HIT' },
  });
}

export function mapStreamError(error: unknown): { message: string; errorCode: string } {
  if (error instanceof AISearchError) {
    const message =
      error.status === HTTP_STATUS.SERVICE_UNAVAILABLE
        ? 'The AI provider is temporarily unavailable (quota or rate limit). Please try again later.'
        : 'The AI search could not be completed. Please try again.';
    const errorCode = error.status === HTTP_STATUS.SERVICE_UNAVAILABLE ? 'PROVIDER_QUOTA' : 'SYNTHESIS_FAILED';
    return { message, errorCode };
  }
  if (error instanceof Error && /429|quota/.test(error.message)) {
    return { message: 'API quota exceeded. Please try again later or use a different API key.', errorCode: 'SYNTHESIS_FAILED' };
  }
  return { message: 'An internal error occurred. Please try again.', errorCode: 'SYNTHESIS_FAILED' };
}

export function mapTopLevelError(error: unknown): NextResponse {
  logger.error('AI Search error:', error instanceof Error ? error.message : 'Unknown error');

  // Thrown validation (400s) passes through with its own status — previously
  // every AppError fell into the 500 below.
  if (AppError.isAppError(error)) {
    return NextResponse.json(fail(error.code ?? 'INTERNAL_ERROR', error.message), {
      status: error.statusCode,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (error instanceof AISearchError) {
    const message =
      error.status === HTTP_STATUS.SERVICE_UNAVAILABLE
        ? 'The AI provider is temporarily unavailable (quota or rate limit). Please try again later.'
        : 'The AI search could not be completed. Please try again.';
    return NextResponse.json(fail('SERVICE_UNAVAILABLE', message), {
      status: error.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (error instanceof Error) {
    if (error.message.includes('429') || error.message.includes('quota')) {
      return NextResponse.json(
        fail('SERVICE_UNAVAILABLE', 'API quota exceeded. Please try again later or use a different API key.'),
        { status: HTTP_STATUS.SERVICE_UNAVAILABLE, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
      return NextResponse.json(fail('GATEWAY_TIMEOUT', 'External API timeout. Please try again with a simpler query.'), {
        status: HTTP_STATUS.GATEWAY_TIMEOUT,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }

  return NextResponse.json(fail('INTERNAL_ERROR', 'An internal error occurred. Please try again.'), {
    status: HTTP_STATUS.INTERNAL,
    headers: { 'Cache-Control': 'no-store' },
  });
}
