import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { sanitizeSearchQuery, validateApiKeys } from '@/lib/sanitize';
import { rateLimit } from '@/lib/services/rate-limit';
import { checkAiSpendCap } from '@/lib/services/ai-spend-cap';
import { logger } from '@/lib/infrastructure/logger';
import { executeAISearch } from '@/modules/ai-search/service';
import { getCachedResult, cacheResult } from '@/modules/ai-search/cache';
import { consumeAiSearchQuota } from '@/lib/services/ai-search-quota';

export const maxDuration = 30;

const searchRequestSchema = z.object({
  query: z
    .string()
    .min(3, 'Query must be at least 3 characters')
    .max(500, 'Query must be at most 500 characters')
    .transform(sanitizeSearchQuery),
  config: z.object({
    exaMode: z.enum(['agentic', 'instant', 'websets']),
    tavilyMode: z.enum(['search', 'extract', 'crawl', 'research']),
    sourceFilter: z.enum(['all', 'technical', 'reddit-hn', 'docs']),
    searchMode: z.enum(['standard', 'instant', 'table']),
  }),
  sessionId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Content-Type check
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(fail('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'), { status: 415, headers: { 'Cache-Control': 'no-store' } });
    }

    // 2. Authentication
    let session;
    try {
      session = await requireSessionOrThrow();
    } catch {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Authentication required'), { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    // 3. Rate limiting by IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      const retryAfter = String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': retryAfter } });
    }

    // 4. Per-user daily AI search quota
    const quota = await consumeAiSearchQuota(session.user.id);
    if (!quota.allowed) {
      return NextResponse.json(fail('RATE_LIMITED', `Daily AI search limit reached (${quota.remaining} remaining). Resets at UTC midnight.`), { status: 429, headers: { 'Cache-Control': 'no-store' } });
    }

    // 4b. Global daily spend cap
    const spendCap = await checkAiSpendCap();
    if (!spendCap.allowed) {
      return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'), { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    // 5. Extract and validate API keys from headers
    const exaKey = request.headers.get('x-exa-key') || process.env.SASTRAM_EXA_KEY || '';
    const tavilyKey = request.headers.get('x-tavily-key') || process.env.SASTRAM_TAVILY_KEY || '';
    const geminiKey = request.headers.get('x-gemini-key') || process.env.SASTRAM_GEMINI_KEY || '';

    if (!exaKey || !tavilyKey || !geminiKey) {
      const missing = [];
      if (!exaKey) missing.push('Exa');
      if (!tavilyKey) missing.push('Tavily');
      if (!geminiKey) missing.push('Gemini');
      return NextResponse.json(fail('VALIDATION_ERROR', `Missing API key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Configure in API Keys settings.`), { status: 400, headers: { 'Cache-Control': 'no-store' } });
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
      return NextResponse.json(fail('VALIDATION_ERROR', `Invalid API key format for: ${invalid.join(', ')}. Please check your keys.`), { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    // 6. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON in request body'), { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const validation = searchRequestSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(fail('VALIDATION_ERROR', firstError?.message || 'Invalid request parameters'), { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const { query, config } = validation.data;

    // Edge case: query is empty after sanitization
    if (!query || query.length < 3) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Query is too short after sanitization. Please try a different search.'), { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    // 7. Check cache
    try {
      const cached = await getCachedResult(query);
      if (cached) {
        return NextResponse.json(ok(cached), {
          headers: {
            'Cache-Control': 'no-store',
            'X-Cache': 'HIT',
          },
        });
      }
    } catch {
      // Cache miss is non-critical, continue
    }

    // 8. Execute the search pipeline
    const result = await executeAISearch(query, config, {
      exa: exaKey,
      tavily: tavilyKey,
      gemini: geminiKey,
    });

    // 9. Validate result shape
    if (!result.synthesis || !Array.isArray(result.sources)) {
      return NextResponse.json(fail('INTERNAL_ERROR', 'Search produced an unexpected result. Please try again.'), { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }

    // 10. Cache the result (async, non-blocking)
    cacheResult(query, result, result.synthesis.queryType).catch(() => {});

    return NextResponse.json(ok(result), {
      headers: {
        'Cache-Control': 'no-store',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    // Log without exposing internals
    logger.error('AI Search error:', error instanceof Error ? error.message : 'Unknown error');

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('429') || error.message.includes('quota')) {
        return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'API quota exceeded. Please try again later or use a different API key.'), { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }
      if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
        return NextResponse.json(fail('GATEWAY_TIMEOUT', 'External API timeout. Please try again with a simpler query.'), { status: 504, headers: { 'Cache-Control': 'no-store' } });
      }
    }

    return NextResponse.json(fail('INTERNAL_ERROR', 'An internal error occurred. Please try again.'), { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
