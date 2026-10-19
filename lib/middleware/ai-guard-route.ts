/**
 * Route-level AI guard (D7) — owns session → rate limit → thread-access →
 * precheck → guards for AI routes. SSE-aware: JSON errors for REST routes,
 * `event: error` SSE responses (mirroring ai-reply/stream's shape) for
 * streaming routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { requireReadOrThrow, type ThreadAccessContext } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';
import { checkAiGuards } from '@/lib/ai/guard';
import type { GuardQuota } from '@/lib/ai/guard';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { sseEvent, sseHeaders } from '@/lib/utils/sse';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { ThreadVisibility } from '@prisma/client';

export interface GuardAiRouteOptions {
  path: AiCallPath;
  /** Per-user daily quota. Null skips the quota leg (spend + gate still run). */
  quota: GuardQuota | null;
  threadId?: string;
  /** Key scope for the api-bucket rate limit: `${scope}:${userId}:${ip}`. */
  rateLimitScope: string;
  /** When true, errors are `event: error` SSE responses instead of JSON. */
  sse: boolean;
  /**
   * Cheap eligibility/validation check run AFTER session + rate limit + thread
   * access but BEFORE quota/spend. Return a Response/AppError to reject without
   * consuming quota or spend; return null to continue.
   */
  precheck?: () => Promise<Response | AppError | null>;
}

export type GuardAiRouteResult =
  | { ok: true; session: SessionPayload; context: ThreadAccessContext | null }
  | { ok: false; response: NextResponse };

function sseError(message: string, status: number): NextResponse {
  return new NextResponse(sseEvent('error', { error: message }), {
    status,
    headers: sseHeaders(),
  });
}

/**
 * Preserves the AppError status/code (404 stays 404, 400 stays 400, 403 stays
 * 403) in both JSON and SSE variants; anything unexpected fails closed as 500
 * rather than leaking through as an access denial or unhandled route error.
 */
function guardFailureResponse(error: unknown, sse: boolean): NextResponse {
  if (AppError.isAppError(error)) {
    const code = error.code !== undefined && error.code.length > 0 ? error.code : 'INTERNAL_ERROR';
    if (sse) {
      return sseError(error.message, error.statusCode);
    }
    return NextResponse.json(fail(code, error.message), { status: error.statusCode });
  }
  logger.error('[ai-guard-route] guard phase failed', error);
  if (sse) {
    return sseError('Internal server error', HTTP_STATUS.INTERNAL);
  }
  return NextResponse.json(fail('INTERNAL_ERROR', 'Internal server error'), { status: HTTP_STATUS.INTERNAL });
}

function toNextResponse(response: Response): NextResponse {
  if (response instanceof NextResponse) return response;
  return new NextResponse(response.body, { status: response.status, headers: response.headers });
}

async function checkAuth(sse: boolean): Promise<SessionPayload | NextResponse> {
  try {
    return await requireSessionOrThrow();
  } catch (authError) {
    if (authError instanceof AppError && authError.code === 'AUTH_REQUIRED') {
      if (sse) {
        return sseError('Unauthorized', HTTP_STATUS.UNAUTHORIZED);
      }
      return NextResponse.json(fail('AUTH_REQUIRED', 'Authentication required'), {
        status: HTTP_STATUS.UNAUTHORIZED,
      });
    }
    throw authError;
  }
}

async function checkRateLimit(req: NextRequest, scope: string, userId: string, sse: boolean): Promise<NextResponse | null> {
  const rateLimitResult = await rateLimit({
    key: `${scope}:${userId}:${getRequestIp(req)}`,
    type: 'api',
  });
  if (!rateLimitResult.success) {
    if (sse) {
      return sseError('Too many requests', HTTP_STATUS.RATE_LIMITED);
    }
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), {
      status: HTTP_STATUS.RATE_LIMITED,
    });
  }
  return null;
}

function buildGuardError(
  code: 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE',
  message: string,
  status: number,
  sse: boolean
): NextResponse {
  if (sse) {
    // Mirror the ai-reply/stream spend error: short message, real status.
    if (code === 'SERVICE_UNAVAILABLE') {
      return sseError('AI features temporarily unavailable', status);
    }
    return sseError(message, status);
  }
  return NextResponse.json(fail(code, message), { status });
}

/**
 * Injectable seam for the guard pipeline (T3). Route handlers use the real
 * adapters; tests inject fakes via `setGuardDepsForTests` instead of
 * whole-module `require.cache` replacement.
 */
export interface GuardDeps {
  checkGuards: typeof checkAiGuards;
  checkAccess: (threadId: string, session: SessionPayload) => Promise<ThreadAccessContext>;
}

const realGuardDeps: GuardDeps = {
  checkGuards: (path, userId, options) => checkAiGuards(path, userId, options),
  checkAccess: (threadId, session) => requireReadOrThrow(threadId, session.user.id, session.user.role),
};

let testGuardDeps: GuardDeps | null = null;

/** Tests only — swapped back to real adapters via `setGuardDepsForTests(null)`. */
export function setGuardDepsForTests(deps: GuardDeps | null): void {
  testGuardDeps = deps;
}

/** Allow-all fake for tests that only assert downstream behavior. */
export function allowAllGuardDeps(): GuardDeps {
  return {
    checkGuards: async () => ({ ok: true }),
    checkAccess: async (threadId) => ({ threadId, createdBy: null, visibility: ThreadVisibility.PUBLIC }),
  };
}

export async function guardAiRoute(req: NextRequest, options: GuardAiRouteOptions): Promise<GuardAiRouteResult> {
  const deps = testGuardDeps ?? realGuardDeps;
  const authResult = await checkAuth(options.sse);
  if (authResult instanceof NextResponse) {
    return { ok: false, response: authResult };
  }
  const session = authResult;

  const rateLimitError = await checkRateLimit(req, options.rateLimitScope, session.user.id, options.sse);
  if (rateLimitError !== null) {
    return { ok: false, response: rateLimitError };
  }

  // Access runs before quota/spend: a missing/forbidden thread must not cost
  // the caller quota, and its 404/403 status must survive the guard.
  let context: ThreadAccessContext | null = null;
  const targetThreadId = options.threadId;
  if (targetThreadId !== undefined && targetThreadId !== null && targetThreadId.length > 0) {
    try {
      context = await deps.checkAccess(targetThreadId, session);
    } catch (accessError) {
      return { ok: false, response: guardFailureResponse(accessError, options.sse) };
    }
  }

  const precheck = options.precheck;
  if (precheck !== undefined) {
    try {
      const precheckResult = await precheck();
      if (AppError.isAppError(precheckResult)) {
        return { ok: false, response: guardFailureResponse(precheckResult, options.sse) };
      }
      if (precheckResult !== null) {
        return { ok: false, response: toNextResponse(precheckResult) };
      }
    } catch (precheckError) {
      return { ok: false, response: guardFailureResponse(precheckError, options.sse) };
    }
  }

  const guards = await deps.checkGuards(options.path, session.user.id, { quota: options.quota });
  if (!guards.ok) {
    return {
      ok: false,
      response: buildGuardError(guards.rejection.code, guards.rejection.message, guards.rejection.status, options.sse),
    };
  }

  return { ok: true, session, context };
}
