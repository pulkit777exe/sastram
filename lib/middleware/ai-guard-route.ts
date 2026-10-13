/**
 * Route-level AI guard (D7) — owns session → rate limit → guards →
 * thread-access for AI routes. SSE-aware: JSON errors for REST routes,
 * `event: error` SSE responses (mirroring ai-reply/stream's shape) for
 * streaming routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { requireReadOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';
import { checkAiGuards } from '@/lib/ai/guard';
import type { GuardQuota } from '@/lib/ai/guard';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { sseEvent, sseHeaders } from '@/lib/utils/sse';
import { AppError } from '@/lib/utils/errors';

export interface GuardAiRouteOptions {
  path: AiCallPath;
  /** Per-user daily quota. Null skips the quota leg (spend + gate still run). */
  quota: GuardQuota | null;
  threadId?: string;
  /** Key scope for the api-bucket rate limit: `${scope}:${userId}:${ip}`. */
  rateLimitScope: string;
  /** When true, errors are `event: error` SSE responses instead of JSON. */
  sse: boolean;
}

export type GuardAiRouteResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

function sseError(message: string, status: number): NextResponse {
  return new NextResponse(sseEvent('error', { error: message }), {
    status,
    headers: sseHeaders(),
  });
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
  checkAccess: (threadId: string, session: SessionPayload) => Promise<void>;
}

const realGuardDeps: GuardDeps = {
  checkGuards: (path, userId, options) => checkAiGuards(path, userId, options),
  checkAccess: async (threadId, session) => {
    await requireReadOrThrow(threadId, session.user.id, session.user.role);
  },
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
    checkAccess: async () => {},
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

  const guards = await deps.checkGuards(options.path, session.user.id, { quota: options.quota });
  if (!guards.ok) {
    return {
      ok: false,
      response: buildGuardError(guards.rejection.code, guards.rejection.message, guards.rejection.status, options.sse),
    };
  }

  const targetThreadId = options.threadId;
  if (targetThreadId !== undefined && targetThreadId !== null && targetThreadId.length > 0) {
    try {
      await deps.checkAccess(targetThreadId, session);
    } catch (error) {
      if (!AppError.isAppError(error)) throw error;
      if (options.sse) {
        return { ok: false, response: sseError('Forbidden', HTTP_STATUS.FORBIDDEN) };
      }
      return { ok: false, response: NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: HTTP_STATUS.FORBIDDEN }) };
    }
  }

  return { ok: true, session };
}
