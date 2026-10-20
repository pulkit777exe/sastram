import { NextRequest, NextResponse } from 'next/server';
import { fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { guardAiRoute } from '@/lib/middleware/ai-guard-route';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { AppError } from '@/lib/utils/errors';
import { isAbortError } from '@/lib/utils/retry';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { logger } from '@/lib/infrastructure/logger';
import { executeAISearch } from '@/modules/ai-search/service';
import { cacheResult } from '@/modules/ai-search/cache';
import { searchWithExa, searchWithTavily } from '@/modules/ai-search/search-providers';
import { createKeyedLlm } from '@/lib/ai/text';
import { persistSearchSession } from '@/modules/ai-search/repository';
import { sseChunk, sseEvent, sseHeaders } from '@/lib/utils/sse';
import { getUserExpertiseLevel, refreshUserExpertise } from '@/lib/services/user-memory';
import {
  QUERY_MIN,
  buildCachedStream,
  checkSearchIdempotency,
  deriveTitle,
  invalidKeysResponse,
  mapStreamError,
  mapTopLevelError,
  missingKeysResponse,
  parseSearchJsonBody,
  resolveApiKeys,
  tryGetCachedResult,
  validateContentType,
  validateSearchBody,
  type ResolvedKeys,
  type SearchRequest,
  type SSEEvent,
} from '@/modules/ai-search/route-helpers';

export const maxDuration = 30;

/** ~25s budget, below maxDuration (30s) so the stream can emit an error and close. */
const AI_SEARCH_DEADLINE_MS = 25_000;

/**
 * Route-level deadline: aborts on the caller's signal (SSE client close) or
 * after AI_SEARCH_DEADLINE_MS, whichever comes first. The signal stops the
 * remaining paid phases and in-flight provider fetches.
 */
function createDeadline(request: NextRequest): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_SEARCH_DEADLINE_MS);
  const onRequestAbort = () => controller.abort();
  if (request.signal.aborted) {
    controller.abort();
  } else {
    request.signal.addEventListener('abort', onRequestAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', onRequestAbort);
    },
  };
}

/** Session gate for the pre-guard preflight (cache/idempotency) paths. */
async function requireSessionForPreflight(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, session: await requireSessionOrThrow() };
  } catch (error) {
    if (AppError.isAppError(error) && error.code === 'AUTH_REQUIRED') {
      // Mirror ai-guard-route's SSE unauthorized shape.
      return {
        ok: false,
        response: new NextResponse(sseEvent('error', { error: 'Unauthorized' }), {
          status: HTTP_STATUS.UNAUTHORIZED,
          headers: sseHeaders(),
        }),
      };
    }
    throw error;
  }
}

function buildLiveStream(
  request: NextRequest,
  session: { user: { id: string } },
  params: {
    effectiveQuery: string;
    config: SearchRequest['config'];
    keys: ResolvedKeys;
    conversationHistory: SearchRequest['conversationHistory'];
    query: string;
    sessionId: string | undefined;
    hasHistory: boolean;
    expertiseLevel?: string;
    signal: AbortSignal;
    clearDeadline: () => void;
  }
): Response {
  const encoder = new TextEncoder();
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const closedRef = { closed: false };
  const safeClose = () => {
    if (!closedRef.closed) {
      closedRef.closed = true;
      try { activeController?.close(); } catch {}
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      activeController = controller;
      const sendEvent = (event: SSEEvent) => {
        if (closedRef.closed) return;
        try { controller.enqueue(encoder.encode(sseChunk(event))); } catch { closedRef.closed = true; }
      };

      try {
        sendEvent({ phase: 'searching' });

        // Expertise is pre-loaded by the caller when available; fall back
        // to a load here so direct buildLiveStream callers keep working.
        const expertiseLevel = params.expertiseLevel ?? (await getUserExpertiseLevel(session.user.id));

        const searchKeys = {
          exa: params.keys.exaKey,
          tavily: params.keys.tavilyKey,
          gemini: params.keys.geminiKey,
          openai: params.keys.openaiKey,
        };
        const result = await executeAISearch(params.effectiveQuery, params.config, {
          llm: createKeyedLlm({ gemini: searchKeys.gemini, openai: searchKeys.openai }),
          search: {
            exa: (query, classification, config) =>
              searchWithExa(query, classification, searchKeys.exa, config, params.signal),
            tavily: async (query, classification, config) => {
              const { sources, answer } = await searchWithTavily(
                query,
                classification,
                searchKeys.tavily,
                config,
                params.signal
              );
              return { sources, answer };
            },
          },
          // No store: this route owns its read (tryGetCachedResult, above)
          // and write (explicit cacheResult, below) with the same
          // expertise key. Service-level read-through stays for
          // store-bearing callers (workers, warming).
          store: undefined,
          history: params.conversationHistory,
          expertise: expertiseLevel,
          signal: params.signal,
        });

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
          cacheResult(params.query, result, result.synthesis.queryType, expertiseLevel).catch((e) =>
            logger.error('[forum-search] cache write failed', { error: e })
          );
        }

        void refreshUserExpertise(session.user.id).catch((err) =>
          logger.warn('[forum-search] refreshUserExpertise failed', { error: err })
        );

        sendEvent({
          phase: 'done',
          synthesis: result.synthesis,
          followUps: result.followUps,
          sessionId: createdSessionId,
          sources: result.sources,
        });
        safeClose();
      } catch (error) {
        logger.error('AI Search streaming error:', error instanceof Error ? error.message : 'Unknown error');
        const mapped = isAbortError(error)
          ? { message: 'The search timed out. Please try again with a simpler query.', errorCode: 'SYNTHESIS_FAILED' }
          : mapStreamError(error);
        sendEvent({ phase: 'error', message: mapped.message, errorCode: mapped.errorCode });
        safeClose();
      } finally {
        params.clearDeadline();
      }
    },
  });

  const onAbort = () => safeClose();
  request.signal.addEventListener('abort', onAbort, { once: true });

  return new Response(stream, {
    status: HTTP_STATUS.OK,
    headers: { ...sseHeaders(), 'X-Cache': 'MISS' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentTypeError = validateContentType(request);
    if (contentTypeError) return contentTypeError;

    // Throwing helpers: VALIDATION_ERROR (400) surfaces via mapTopLevelError,
    // which passes AppError statuses through instead of flattening to 500.
    const data = validateSearchBody(await parseSearchJsonBody(request));

    const keys = resolveApiKeys(data.keys);
    const missingResponse = missingKeysResponse(keys);
    if (missingResponse) return missingResponse;

    const invalidResponse = invalidKeysResponse(keys);
    if (invalidResponse) return invalidResponse;

    const { query, config, sessionId, clientNonce, conversationHistory } = data;

    if (!query || query.trim().length < QUERY_MIN) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'Query is too short after sanitization. Please try again with a different search.'),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Validate conversationHistory total chars before burning quota
    if (conversationHistory) {
      const totalHistoryChars = conversationHistory.reduce((acc, m) => acc + (m.content?.length ?? 0), 0);
      if (totalHistoryChars > 10000) {
        return NextResponse.json(fail('VALIDATION_ERROR', 'Conversation history too large'), {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    }

    // Replay/cache preflight BEFORE the guard: a replayed nonce or a synthesis
    // cache hit must not consume quota/spend. A session is still required;
    // rate limiting is intentionally skipped for cache hits (a cheap DB read).
    const preflight = await requireSessionForPreflight();
    if (!preflight.ok) return preflight.response;
    const session = preflight.session;

    const idempotencyError = await checkSearchIdempotency(clientNonce, session.user.id);
    if (idempotencyError) return idempotencyError;

    const effectiveQuery = query;
    const hasHistory = conversationHistory !== undefined && conversationHistory.length > 0;
    const expertiseLevel = await getUserExpertiseLevel(session.user.id);

    if (!hasHistory) {
      const cached = await tryGetCachedResult(query, expertiseLevel);
      if (cached) {
        return buildCachedStream(cached);
      }
    }

    const guard = await guardAiRoute(request, {
      path: AiCallPath.FORUM_SEARCH_SYNTHESIZE,
      quota: { kind: 'search' },
      rateLimitScope: 'ai-forum-search',
      sse: true,
    });
    if (!guard.ok) return guard.response;

    const deadline = createDeadline(request);

    return buildLiveStream(request, session, {
      effectiveQuery,
      config,
      keys,
      conversationHistory,
      query,
      sessionId,
      hasHistory,
      expertiseLevel,
      signal: deadline.signal,
      clearDeadline: deadline.clear,
    });
  } catch (error) {
    return mapTopLevelError(error);
  }
}
