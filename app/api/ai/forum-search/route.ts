import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/utils/api-response';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { sanitizeSearchQuery, validateApiKeys } from '@/lib/sanitize';
import { rateLimit } from '@/lib/services/rate-limit';
import { checkAiSpendCap } from '@/lib/services/ai-spend-cap';
import { logger } from '@/lib/infrastructure/logger';
import { executeAISearch, AISearchPipelineResult, AISearchError } from '@/modules/ai-search/service';
import { getCachedResult, cacheResult } from '@/modules/ai-search/cache';
import { persistSearchSession } from '@/modules/ai-search/repository';
import { consumeAiSearchQuota } from '@/lib/services/ai-search-quota';
import { consumeIdempotencyKey } from '@/lib/services/idempotency';
import { env } from '@/lib/config/env';

export const maxDuration = 30;

const QUERY_MIN = 3;
const QUERY_MAX = 500;

const searchRequestSchema = z.object({
  query: z
    .string()
    .min(QUERY_MIN, `Query must be at least ${QUERY_MIN} characters`)
    .max(QUERY_MAX, `Query must be at most ${QUERY_MAX} characters`)
    .transform(sanitizeSearchQuery),
  keys: z
    .object({
      exa: z.string().min(1),
      tavily: z.string().min(1),
      gemini: z.string().min(1),
      openai: z.string().min(1).optional(),
    })
    .strict(),
  config: z.object({
    exaMode: z.enum(['agentic', 'instant', 'websets']),
    tavilyMode: z.enum(['search', 'extract', 'crawl', 'research']),
    sourceFilter: z.enum(['all', 'technical', 'reddit-hn', 'docs']),
    searchMode: z.enum(['standard', 'instant', 'table']),
  }),
  parentSessionId: z.string().uuid().optional(),
  clientNonce: z.string().min(8).max(64).optional(),
  context: z
    .object({
      query: z.string(),
      followUp: z.string(),
    })
    .optional(),
});

export type SSEEvent =
  | { phase: 'searching' }
  | { phase: 'reading'; sources: AISearchPipelineResult['sources'] }
  | { phase: 'crossref' }
  | { phase: 'synthesizing' }
  | { phase: 'done'; synthesis: AISearchPipelineResult['synthesis']; followUps: string[]; sessionId?: string }
  | { phase: 'refine'; sources: AISearchPipelineResult['sources']; suggestion?: string }
  | { phase: 'blocked'; message: string }
  | { phase: 'error'; message: string; errorCode?: string };

function sseChunk(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function blockedStream(message: string): Response {
  const body = sseChunk({ phase: 'blocked', message });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}

function deriveTitle(query: string): string {
  const words = query.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6);
  const t = words.join(' ');
  return t.length > 60 ? `${t.substring(0, 57)}…` : t;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        fail('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'),
        { status: 415, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let session;
    try {
      session = await requireSessionOrThrow();
    } catch {
      return NextResponse.json(
        fail('AUTH_REQUIRED', 'Authentication required'),
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      const retryAfter = String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      return NextResponse.json(
        fail('RATE_LIMITED', 'Too many requests. Please try again later.'),
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': retryAfter } }
      );
    }

    const quota = await consumeAiSearchQuota(session.user.id);
    if (!quota.allowed) {
      return blockedStream(
        `Daily AI search limit reached (${quota.remaining} remaining). Resets at UTC midnight.`
      );
    }

    const spendCap = await checkAiSpendCap();
    if (!spendCap.allowed) {
      return blockedStream('AI features temporarily unavailable due to high demand. Resets at UTC midnight.');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'Invalid JSON in request body'),
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const parsedBody = body as {
      query?: string;
      config?: unknown;
      keys?: { exa?: string; tavily?: string; gemini?: string; openai?: string };
      parentSessionId?: string;
      clientNonce?: string;
      context?: { query: string; followUp: string };
    };
    const keys = parsedBody.keys;

    const exaKey = keys?.exa || env.SASTRAM_EXA_KEY || '';
    const tavilyKey = keys?.tavily || env.SASTRAM_TAVILY_KEY || '';
    const geminiKey = keys?.gemini || env.SASTRAM_GEMINI_KEY || '';
    const openaiKey = keys?.openai || env.OPENAI_API_KEY || '';

    if (!exaKey || !tavilyKey || !geminiKey) {
      const missing = [];
      if (!exaKey) missing.push('Exa');
      if (!tavilyKey) missing.push('Tavily');
      if (!geminiKey) missing.push('Gemini');
      return NextResponse.json(
        fail('VALIDATION_ERROR', `Missing API key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Configure in API Keys settings.`),
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const keyValidation = validateApiKeys({
      exa: exaKey,
      tavily: tavilyKey,
      gemini: geminiKey,
    });

    if (!keyValidation.allValid) {
      const invalid = [];
      if (!keyValidation.exaValid) invalid.push('Exa');
      if (!keyValidation.tavilyValid) invalid.push('Tavily');
      if (!keyValidation.geminiValid) invalid.push('Gemini');
      return NextResponse.json(
        fail('VALIDATION_ERROR', `Invalid API key format for: ${invalid.join(', ')}. Please check your keys.`),
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const validation = searchRequestSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        fail('VALIDATION_ERROR', firstError?.message || 'Invalid request parameters'),
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { query, config, parentSessionId, clientNonce, context } = validation.data;

    if (!query || query.trim().length < QUERY_MIN) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'Query is too short after sanitization. Please try again with a different search.'),
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (clientNonce) {
      const ok = await consumeIdempotencyKey(`ai-search:nonce:${clientNonce}`);
      if (!ok) {
        return blockedStream('This search was already submitted.');
      }
    }

    const effectiveQuery = context ? `${context.query} — follow-up: ${context.followUp}` : query;

    if (!context) {
      try {
        const cached = await getCachedResult(query);
        if (cached) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(sseChunk({ phase: 'searching' })));
              controller.enqueue(encoder.encode(sseChunk({ phase: 'reading', sources: cached.sources })));
              controller.enqueue(encoder.encode(sseChunk({ phase: 'crossref' })));
              controller.enqueue(encoder.encode(sseChunk({ phase: 'synthesizing' })));
              controller.enqueue(
                encoder.encode(
                  sseChunk({
                    phase: 'done',
                    synthesis: { ...cached.synthesis, cachedAt: cached.synthesis.cachedAt },
                    followUps: (cached as AISearchPipelineResult).followUps ?? [],
                  })
                )
              );
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-store',
              Connection: 'keep-alive',
              'X-Cache': 'HIT',
            },
          });
        }
      } catch (err) {
        logger.debug('[forum-search] Cache read failed, proceeding without cache', { error: err });
      }
    }

    // 9. Stream response
    const encoder = new TextEncoder();
    let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        activeController = controller;
        const send = (event: SSEEvent) => controller.enqueue(encoder.encode(sseChunk(event)));

        try {
          send({ phase: 'searching' });

          const result = await executeAISearch(effectiveQuery, config, {
            exa: exaKey,
            tavily: tavilyKey,
            gemini: geminiKey,
            openai: openaiKey,
          });

          send({ phase: 'reading', sources: result.sources });
          send({ phase: 'crossref' });

          if (result.phase === 'refine' && result.sources.length === 0) {
            send({
              phase: 'error',
              message: 'Both search providers failed to return results. Please try again.',
              errorCode: 'PROVIDER_FAILURE',
            });
            controller.close();
            return;
          }

          if (result.phase === 'refine') {
            send({
              phase: 'refine',
              sources: result.sources,
              suggestion: `Try broadening your search: ${query} explained`,
            });
            controller.close();
            return;
          }

          send({ phase: 'synthesizing' });

          let createdSessionId: string | undefined;
          if (!context) {
            createdSessionId = crypto.randomUUID();
            const sid = createdSessionId;
            persistSearchSession(
              session.user.id,
              query,
              result.synthesis,
              result.sources,
              result.followUps,
              {
                id: sid,
                parentSessionId,
                title: deriveTitle(query),
                timings: result.timings,
              }
            ).catch(() => {});
          }

          if (!context) {
            cacheResult(query, result, result.synthesis.queryType).catch(() => {});
          }

          send({
            phase: 'done',
            synthesis: result.synthesis,
            followUps: result.followUps,
            sessionId: createdSessionId,
          });
          controller.close();
        } catch (error) {
          logger.error('AI Search streaming error:', error instanceof Error ? error.message : 'Unknown error');
          const message =
            error instanceof AISearchError
              ? error.status === 503
                ? 'The AI provider is temporarily unavailable (quota or rate limit). Please try again later.'
                : 'The AI search could not be completed. Please try again.'
              : error instanceof Error && /429|quota/.test(error.message)
                ? 'API quota exceeded. Please try again later or use a different API key.'
                : 'An internal error occurred. Please try again.';
          const errorCode =
            error instanceof AISearchError && error.status === 503 ? 'PROVIDER_QUOTA' : 'SYNTHESIS_FAILED';
          send({ phase: 'error', message, errorCode });
          controller.close();
        }
      },
    });

    request.signal.addEventListener('abort', () => {
      try {
        activeController?.close();
      } catch {
        /* already closed */
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    logger.error('AI Search error:', error instanceof Error ? error.message : 'Unknown error');

    if (error instanceof AISearchError) {
      const message =
        error.status === 503
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
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
        return NextResponse.json(
          fail('GATEWAY_TIMEOUT', 'External API timeout. Please try again with a simpler query.'),
          { status: 504, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    return NextResponse.json(
      fail('INTERNAL_ERROR', 'An internal error occurred. Please try again.'),
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}