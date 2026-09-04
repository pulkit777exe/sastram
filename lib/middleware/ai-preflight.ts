import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { consumeAiAnalysisQuota, consumeAiSearchQuota } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';
import { AppError } from '@/lib/utils/errors';
import { getRequestIp } from '@/lib/utils/request-ip';
import { blockedStream } from '@/lib/utils/sse';

export type QuotaType = 'analysis' | 'search';

export interface AiPreflightOptions {
  aiCallPath: AiCallPath;
  /** Quota type: 'analysis' (default) or 'search' */
  quotaType?: QuotaType;
  /** Skip cost gate (e.g. for CHEAP paths like RESOLUTION_SCORE) */
  skipCostGate?: boolean;
  /** Thread ID for access check. If provided, thread access is verified. */
  threadId?: string;
  /**
   * When true, quota/spend/cost-gate failures return an SSE `blocked`
   * stream (200 + text/event-stream) instead of JSON 429/503 so the
   * client SSE parser does not have to branch on Content-Type.
   * Used by forum-search which streams.
   */
  sseMode?: boolean;
}

export interface AiPreflightResult {
  ok: true;
  session: SessionPayload;
}

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_FORBIDDEN = 403;
const HTTP_UNAUTHORIZED = 401;

function buildSseOrJsonError(message: string, code: string, httpStatus: number, useSseMode?: boolean): NextResponse {
  if (useSseMode) {
    return blockedStream(message);
  }
  return NextResponse.json(fail(code, message), { status: httpStatus });
}

async function buildRateLimitErrorResponse(useSseMode?: boolean): Promise<NextResponse> {
  const message = 'Too many requests. Please try again later.';
  return buildSseOrJsonError(message, 'RATE_LIMITED', HTTP_TOO_MANY_REQUESTS, useSseMode);
}

async function buildQuotaErrorResponse(
  quotaType: QuotaType,
  useSseMode?: boolean
): Promise<NextResponse> {
  let message: string;
  if (quotaType === 'search') {
    message = 'Daily AI search limit reached. Resets at UTC midnight.';
  } else {
    message = 'Daily AI analysis limit reached. Resets at UTC midnight.';
  }
  return buildSseOrJsonError(message, 'RATE_LIMITED', HTTP_TOO_MANY_REQUESTS, useSseMode);
}

async function buildSpendCapErrorResponse(useSseMode?: boolean): Promise<NextResponse> {
  const message = 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.';
  return buildSseOrJsonError(message, 'SERVICE_UNAVAILABLE', HTTP_SERVICE_UNAVAILABLE, useSseMode);
}

/**
 * Runs the standard AI route preflight checks:
 * 1. Authentication
 * 2. IP rate limiting
 * 3. Per-user daily quota
 * 4. Global spend cap
 * 5. Cost gate (optional)
 * 6. Thread access (optional)
 *
 * Returns { ok: true, session } on success, or a NextResponse error on failure.
 */
async function checkAuth(): Promise<SessionPayload | NextResponse> {
  try {
    const session = await requireSessionOrThrow();
    return session;
  } catch (authError) {
    if (authError instanceof AppError && authError.code === 'AUTH_REQUIRED') {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Authentication required'), {
        status: HTTP_UNAUTHORIZED,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    throw authError;
  }
}

async function checkRateLimit(req: NextRequest, useSseMode?: boolean): Promise<NextResponse | null> {
  const clientIp = getRequestIp(req);
  const rateLimitResult = await rateLimit(clientIp);
  if (!rateLimitResult.success) {
    return buildRateLimitErrorResponse(useSseMode);
  }
  return null;
}

async function checkDailyQuota(userId: string, quotaType: QuotaType, useSseMode?: boolean): Promise<NextResponse | null> {
  let consumeQuota: typeof consumeAiAnalysisQuota;
  if (quotaType === 'search') {
    consumeQuota = consumeAiSearchQuota;
  } else {
    consumeQuota = consumeAiAnalysisQuota;
  }
  const quotaResult = await consumeQuota(userId);
  if (!quotaResult.allowed) {
    return buildQuotaErrorResponse(quotaType, useSseMode);
  }
  return null;
}

async function checkSpendCap(aiCallPath: AiCallPath, useSseMode?: boolean): Promise<{ allowed: boolean; response: NextResponse | null }> {
  const spendCapResult = await enforceAiSpendCap(aiCallPath);
  if (!spendCapResult.allowed) {
    return { allowed: false, response: await buildSpendCapErrorResponse(useSseMode) };
  }
  return { allowed: true, response: null };
}

async function checkCostGate(aiCallPath: AiCallPath, spendCapAllowed: boolean, useSseMode?: boolean): Promise<NextResponse | null> {
  const gateResult = evaluateAiCostGate({ path: aiCallPath, spendCapAllowed });
  if (!gateResult.allowed) {
    return buildSpendCapErrorResponse(useSseMode);
  }
  return null;
}

async function checkThreadAccess(threadId: string, session: SessionPayload): Promise<NextResponse | null> {
  try {
    await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
    return null;
  } catch {
    return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: HTTP_FORBIDDEN });
  }
}

export async function withAiPreflight(
  req: NextRequest,
  options: AiPreflightOptions
): Promise<AiPreflightResult | NextResponse> {
  const aiCallPath = options.aiCallPath;
  let quotaType: QuotaType = 'analysis';
  if (options.quotaType !== undefined) {
    quotaType = options.quotaType;
  }
  let skipCostGate = false;
  if (options.skipCostGate === true) {
    skipCostGate = true;
  }
  const targetThreadId = options.threadId;
  const useSseMode = options.sseMode;

  const authResult = await checkAuth();
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const rateLimitError = await checkRateLimit(req, useSseMode);
  if (rateLimitError !== null) return rateLimitError;

  const quotaError = await checkDailyQuota(session.user.id, quotaType, useSseMode);
  if (quotaError !== null) return quotaError;

  const spendCapCheck = await checkSpendCap(aiCallPath, useSseMode);
  if (!spendCapCheck.allowed) {
    const spendCapError = spendCapCheck.response;
    if (spendCapError !== null) return spendCapError;
  }

  if (!skipCostGate) {
    const costGateError = await checkCostGate(aiCallPath, true, useSseMode);
    if (costGateError !== null) return costGateError;
  }

  if (targetThreadId !== undefined && targetThreadId !== null && targetThreadId.length > 0) {
    const threadAccessError = await checkThreadAccess(targetThreadId, session);
    if (threadAccessError !== null) return threadAccessError;
  }

  return { ok: true, session };
}
