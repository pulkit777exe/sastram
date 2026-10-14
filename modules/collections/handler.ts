import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow, type SessionPayload } from '@/modules/auth';
import { withErrorHandling, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
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
 * Validation also lives here now (A1): `parseRouteId` / `parseJsonBody`
 * throw `VALIDATION_ERROR` (400) through `withErrorHandling` instead of
 * each route hand-rolling `safeParse` + `fail(...)` plumbing.
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

const HTTP_BAD_REQUEST = 400;

function validationError(message: string): AppError {
  return new AppError(message, 'VALIDATION_ERROR', HTTP_BAD_REQUEST);
}

/** `safeParse` that throws — `withErrorHandling` maps it to a 400. */
export function parseWith<T>(schema: z.ZodType<T>, raw: unknown, fallbackMessage = 'Invalid input'): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw validationError(parsed.error.issues[0]?.message ?? fallbackMessage);
  }
  return parsed.data;
}

/** JSON body read — malformed JSON is a 400, not a 500. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError('Invalid JSON body');
  }
}

/** One line for the `request.json() + safeParse` pair every POST repeats. */
export async function parseJsonBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  return parseWith(schema, await readJsonBody(request));
}

/** One line for the `:id` param validation every `[id]` route repeats. */
export async function parseRouteId(
  context: CollectionsRouteContext | undefined,
  schema: z.ZodType<string>
): Promise<string> {
  const { id } = await context!.params;
  const parsed = schema.safeParse(id);
  if (!parsed.success) {
    throw validationError('Invalid collection id');
  }
  return parsed.data;
}

/** Required query param (`?itemId=`) — missing is 400, malformed is 400. */
export function parseQueryParam(
  searchParams: URLSearchParams,
  name: string,
  schema: z.ZodType<string>
): string {
  const raw = searchParams.get(name);
  if (raw === null) {
    throw new AppError(`${name} required`, 'BAD_REQUEST', HTTP_BAD_REQUEST);
  }
  return parseWith(schema, raw, `Invalid ${name}`);
}
