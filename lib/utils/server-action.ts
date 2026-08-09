import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';
import { actionFailure, type ActionErrorCode } from '@/lib/actions/result';
import { AppError } from './errors';

// redirect() signals by throwing; these must propagate rather than be caught
// and reported as an action failure.
function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as Record<string, unknown>).digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return true;
  return err instanceof Error && err.message?.includes('NEXT_REDIRECT');
}

export interface ActionResult<T = unknown> {
  data: T | null;
  error: string | null;
  ok?: boolean;
  errorCode?: ActionErrorCode | null;
}

export interface ServerActionOptions<In, Out = unknown> {
  schema: z.ZodSchema<In>;
  actionName: string;
}

export function createServerAction<In, Out = unknown>(
  options: ServerActionOptions<In, Out>,
  handler: (args: In) => Promise<ActionResult<Out>>
): (...args: unknown[]) => Promise<ActionResult<Out>> {
  const { schema, actionName } = options;

  return async (...handlerArgs: unknown[]): Promise<ActionResult<Out>> => {
    let validatedArgs: In;
    try {
      const input =
        handlerArgs.length === 1 && handlerArgs[0] instanceof FormData
          ? Object.fromEntries(handlerArgs[0].entries())
          : handlerArgs.length === 1
            ? handlerArgs[0]
            : handlerArgs;
      validatedArgs = schema.parse(input);
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        logger.error(`[${actionName}] validation`, error);
      }
      return actionFailure('VALIDATION_ERROR', 'Invalid input');
    }

    try {
      return await handler(validatedArgs);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }

      // AppError carries a deliberate user-facing message and code, so it's
      // passed through without logging as an unexpected failure.
      if (error instanceof AppError) {
        return {
          ok: false,
          data: null,
          error: error.message,
          errorCode: error.code as ActionErrorCode,
        };
      }

      logger.error(`[${actionName}]`, error);
      return {
        ok: false,
        data: null,
        error: (error instanceof Error && error.message) || 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  };
}

/** Positional-args variant of createServerAction. */
export function withValidation<In, Out = unknown>(
  schema: z.ZodSchema<In>,
  actionName: string,
  handler: (args: In) => Promise<ActionResult<Out>>
) {
  return createServerAction<In, Out>({ schema, actionName }, handler);
}
