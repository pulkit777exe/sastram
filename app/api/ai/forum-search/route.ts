import { NextRequest, NextResponse } from 'next/server';
import { fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { z } from 'zod';
import { sanitizeSearchQuery, validateApiKeys } from '@/modules/ai-search/sanitize';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { logger } from '@/lib/infrastructure/logger';
import { executeAISearch, type AISearchPipelineResult } from '@/modules/ai-search/service';
import { AISearchError } from '@/modules/ai-search/synthesis';
import { getCachedResult, cacheResult } from '@/modules/ai-search/cache';
import { persistSearchSession } from '@/modules/ai-search/repository';
import { consumeIdempotencyKey } from '@/lib/services/idempotency';
import { env } from '@/lib/config/env';
import { sseChunk, blockedStream, sseHeaders } from '@/lib/utils/sse';
import { refreshUserExpertise } from '@/lib/services/user-memory';
import { prisma } from '@/lib/infrastructure/prisma';

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
  sessionId: z.string().uuid().optional(),
  clientNonce: z.string().min(8).max(64).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .max(20)
    .optional(),
});

export type SSEEvent =
  | { phase: 'searching' }
  | { phase: 'reading'; sources: AISearchPipelineResult['sources'] }
  | { phase: 'crossref' }
  | { phase: 'synthesizing' }
  | { phase: 'done'; synthesis: AISearchPipelineResult['synthesis']; followUps: string[]; sessionId?: string; sources?: AISearchPipelineResult['sources'] }
  | { phase: 'blocked'; message: string }
  | { phase: 'error'; message: string; errorCode?: string };

function deriveTitle(query: string): string {
  const words = query.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6);
  const t = words.join(' ');
  return t.length > 60 ? `${t.substring(0, 57)}…` : t;
}

// ---- Named step helpers (flatten handler, avoid nested try inside handler) ----

function validateContentType(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(
      fail('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'),
      { status: HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return null;
}

async function parseJsonBody(request: NextRequest): Promise<{ body: unknown } | { error: NextResponse }> {
  try {
    const body = await request.json();
    return { body };
  } catch {
    return {
      error: NextResponse.json(
        fail('VALIDATION_ERROR', 'Invalid JSON in request body'),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }
}

function validateBody(body: unknown): { data: z.infer<typeof searchRequestSchema> } | { error: NextResponse } {
  const validation = searchRequestSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return {
      error: NextResponse.json(
        fail('VALIDATION_ERROR', firstError?.message || 'Invalid request parameters'),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }
  return { data: validation.data };
}

function resolveApiKeys(keys: z.infer<typeof searchRequestSchema>['keys']) {
  return {
    exaKey: keys.exa || env.SASTRAM_EXA_KEY || '',
    tavilyKey: keys.tavily || env.SASTRAM_TAVILY_KEY || '',
    geminiKey: keys.gemini || env.SASTRAM_GEMINI_KEY || '',
    openaiKey: keys.openai || env.OPENAI_API_KEY || '',
  };
}

function checkApiKeysPresent(keys: ReturnType<typeof resolveApiKeys>): NextResponse | null {
  const missing: string[] = [];
  if (!keys.exaKey) missing.push('Exa');
  if (!keys.tavilyKey) missing.push('Tavily');
  if (!keys.geminiKey) missing.push('Gemini');
  if (missing.length === 0) return null;
  return NextResponse.json(
    fail('VALIDATION_ERROR', `Missing API key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Configure in API Keys settings.`),
    { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Cache-Control': 'no-store' } }
  );
}

function checkApiKeyFormat(keys: ReturnType<typeof resolveApiKeys>): NextResponse | null {
  const keyValidation = validateApiKeys({
    exa: keys.exaKey,
    tavily: keys.tavilyKey,
    gemini: keys.geminiKey,
  });
  if (keyValidation.allValid) return null;
  const invalid: string[] = [];
  if (!keyValidation.exaValid) invalid.push('Exa');
  if (!keyValidation.tavilyValid) invalid.push('Tavily');
  if (!keyValidation.geminiValid) invalid.push('Gemini');
  return NextResponse.json(
    fail('VALIDATION_ERROR', `Invalid API key format for: ${invalid.join(', ')}. Please check your keys.`),
    { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function checkIdempotency(clientNonce: string | undefined): Promise<NextResponse | null> {
  if (!clientNonce) return null;
  const ok = await consumeIdempotencyKey(`ai-search:nonce:${clientNonce}`);
  if (!ok) {
    return blockedStream('This search was already submitted.');
  }
  return null;
}

async function tryGetCachedResult(query: string): Promise<AISearchPipelineResult | null> {
  try {
    const cached = await getCachedResult(query);
    if (cached) return cached as AISearchPipelineResult;
    return null;
  } catch (err) {
    logger.debug('[forum-search] Cache read failed, proceeding without cache', { error: err });
    return null;
  }
}

function buildCachedStream(cached: AISearchPipelineResult): Response {
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

function mapStreamError(error: unknown): { message: string; errorCode: string } {
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

function mapTopLevelError(error: unknown): NextResponse {
  logger.error('AI Search error:', error instanceof Error ? error.message : 'Unknown error');

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
      return NextResponse.json(
        fail('GATEWAY_TIMEOUT', 'External API timeout. Please try again with a simpler query.'),
        { status: HTTP_STATUS.GATEWAY_TIMEOUT, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  return NextResponse.json(
    fail('INTERNAL_ERROR', 'An internal error occurred. Please try again.'),
    { status: HTTP_STATUS.INTERNAL, headers: { 'Cache-Control': 'no-store' } }
  );
}

function buildLiveStream(
  request: NextRequest,
  session: { user: { id: string } },
  params: {
    effectiveQuery: string;
    config: z.infer<typeof searchRequestSchema>['config'];
    keys: ReturnType<typeof resolveApiKeys>;
    conversationHistory: z.infer<typeof searchRequestSchema>['conversationHistory'];
    query: string;
    sessionId: string | undefined;
    hasHistory: boolean;
  }
): Response {
  const encoder = new TextEncoder();
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      activeController = controller;
      const sendEvent = (event: SSEEvent) => controller.enqueue(encoder.encode(sseChunk(event)));

      try {
        sendEvent({ phase: 'searching' });

        // KISS: fetch expertiseLevel from User.preferences for personalized depth
        let expertiseLevel: string | undefined;
        try {
          const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
          const prefs = u?.preferences as unknown as { expertiseLevel?: string } | null;
          if (prefs?.expertiseLevel) expertiseLevel = prefs.expertiseLevel;
        } catch {}

        const result = await executeAISearch(
          params.effectiveQuery,
          params.config,
          {
            exa: params.keys.exaKey,
            tavily: params.keys.tavilyKey,
            gemini: params.keys.geminiKey,
            openai: params.keys.openaiKey,
          },
          params.conversationHistory,
          expertiseLevel
        );

        sendEvent({ phase: 'reading', sources: result.sources });
        sendEvent({ phase: 'crossref' });

        if (result.sources.length === 0) {
          sendEvent({
            phase: 'error',
            message: 'No results found for this query. Please try a different search.',
            errorCode: 'NO_RESULTS',
          });
          controller.close();
          return;
        }

        sendEvent({ phase: 'synthesizing' });

        let createdSessionId: string | undefined;
        if (!params.hasHistory) {
          createdSessionId = params.sessionId || crypto.randomUUID();
          const sid = createdSessionId;
          persistSearchSession(
            session.user.id,
            params.query,
            result.synthesis,
            result.sources,
            result.followUps,
            {
              id: sid,
              title: deriveTitle(params.query),
              timings: result.timings,
            }
          ).catch((e) => logger.error('[forum-search] persist session failed', { error: e }));
        }

        if (!params.hasHistory) {
          cacheResult(params.query, result, result.synthesis.queryType).catch((e) =>
            logger.error('[forum-search] cache write failed', { error: e })
          );
        }

        void refreshUserExpertise(session.user.id).catch(() => {});

        sendEvent({
          phase: 'done',
          synthesis: result.synthesis,
          followUps: result.followUps,
          sessionId: createdSessionId,
          sources: result.sources,
        });
        controller.close();
      } catch (error) {
        logger.error('AI Search streaming error:', error instanceof Error ? error.message : 'Unknown error');
        const { message, errorCode } = mapStreamError(error);
        sendEvent({ phase: 'error', message, errorCode });
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
    status: HTTP_STATUS.OK,
    headers: { ...sseHeaders(), 'X-Cache': 'MISS' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentTypeError = validateContentType(request);
    if (contentTypeError) return contentTypeError;

    const preflight = await withAiPreflight(request, {
      aiCallPath: AiCallPath.FORUM_SEARCH_SYNTHESIZE,
      quotaType: 'search',
      sseMode: true,
    });
    if (preflight instanceof NextResponse) return preflight;
    const session = preflight.session;

    const parsedBody = await parseJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const validated = validateBody(parsedBody.body);
    if ('error' in validated) return validated.error;

    const keys = resolveApiKeys(validated.data.keys);
    const missingKeysError = checkApiKeysPresent(keys);
    if (missingKeysError) return missingKeysError;

    const formatError = checkApiKeyFormat(keys);
    if (formatError) return formatError;

    const { query, config, sessionId, clientNonce, conversationHistory } = validated.data;

    if (!query || query.trim().length < QUERY_MIN) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'Query is too short after sanitization. Please try again with a different search.'),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const idempotencyError = await checkIdempotency(clientNonce);
    if (idempotencyError) return idempotencyError;

    const effectiveQuery = query;
    const hasHistory = conversationHistory !== undefined && conversationHistory.length > 0;

    if (!hasHistory) {
      const cached = await tryGetCachedResult(query);
      if (cached) {
        return buildCachedStream(cached);
      }
    }

    return buildLiveStream(request, session, {
      effectiveQuery,
      config,
      keys,
      conversationHistory,
      query,
      sessionId,
      hasHistory,
    });
  } catch (error) {
    return mapTopLevelError(error);
  }
}
