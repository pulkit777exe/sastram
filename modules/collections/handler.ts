import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { withErrorHandling, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { rateLimit } from '@/lib/services/rate-limit';
import { isCollectionsEnabled } from './enabled';

export interface CollectionsRouteContext {
  params: Promise<Record<string, string>>;
}

export type CollectionsRun = (
  request: NextRequest,
  session: SessionPayload,
  context?: CollectionsRouteContext,
) => Promise<NextResponse>;

export interface CollectionsHandlerOpts {
  /**
   * Default true. Pass `false` explicitly (with a comment at the call site)
   * only for routes that must work while collections is disabled.
   */
  requireEnabled?: boolean;
  rateLimitKey?: (session: SessionPayload) => string;
}

/**
 * Single seam for the collections guard preamble:
 * session → rate limit → enabled gate.
 *
 * Collapses the 8 hand-rolled copies across `app/api/collections/**`.
 * Validation and policy stay in the `run` callback (D2 moves them here).
 */
export function withCollectionsHandler(run: CollectionsRun, opts: CollectionsHandlerOpts = {}) {
  const { requireEnabled = true, rateLimitKey } = opts;
  return withErrorHandling(async (request: NextRequest, context?: CollectionsRouteContext) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({
      key: rateLimitKey?.(session) ?? `collections:${session.user.id}`,
      type: 'api',
    });
    if (!rl.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), {
        status: HTTP_STATUS.RATE_LIMITED,
      });
    }
    if (requireEnabled && !(await isCollectionsEnabled(session.user.id))) {
      return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), {
        status: HTTP_STATUS.FORBIDDEN,
      });
    }
    return run(request, session, context);
  });
}
