import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { consumeAiAnalysisQuota, consumeAiSearchQuota } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';

export type QuotaType = 'analysis' | 'search';

export interface AiPreflightOptions {
  aiCallPath: AiCallPath;
  /** Quota type: 'analysis' (default) or 'search' */
  quotaType?: QuotaType;
  /** Skip cost gate (e.g. for CHEAP paths like RESOLUTION_SCORE) */
  skipCostGate?: boolean;
  /** Thread ID for access check. If provided, thread access is verified. */
  threadId?: string;
}

export interface AiPreflightResult {
  ok: true;
  session: SessionPayload;
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
export async function withAiPreflight(
  req: NextRequest,
  options: AiPreflightOptions
): Promise<AiPreflightResult | NextResponse> {
  const { aiCallPath, quotaType = 'analysis', skipCostGate = false, threadId } = options;

  // 1. Auth
  const session = await requireSessionOrThrow();

  // 2. Rate limit
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
  }

  // 3. Daily quota
  const consumeQuota = quotaType === 'search' ? consumeAiSearchQuota : consumeAiAnalysisQuota;
  const quota = await consumeQuota(session.user.id);
  if (!quota.allowed) {
    const message =
      quotaType === 'search'
        ? 'Daily AI search limit reached. Resets at UTC midnight.'
        : 'Daily AI analysis limit reached. Resets at UTC midnight.';
    return NextResponse.json(fail('RATE_LIMITED', message), { status: 429 });
  }

  // 4. Spend cap
  const spendCap = await enforceAiSpendCap(aiCallPath);
  if (!spendCap.allowed) {
    return NextResponse.json(
      fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'),
      { status: 503 }
    );
  }

  // 5. Cost gate (optional)
  if (!skipCostGate) {
    const gate = evaluateAiCostGate({ path: aiCallPath, spendCapAllowed: spendCap.allowed });
    if (!gate.allowed) {
      return NextResponse.json(
        fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'),
        { status: 503 }
      );
    }
  }

  // 6. Thread access (optional)
  if (threadId) {
    try {
      await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
    } catch {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }
  }

  return { ok: true, session };
}
