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
  ok: boolean;
  errorCode: ActionErrorCode | null;
}

/** `In` is the schema's parsed output, `Raw` its accepted input (pre-defaults/coercion). */
export interface ServerActionOptions<In, Raw = In> {
  schema: z.ZodType<In, Raw>;
  actionName: string;
}

/**
 * Actions take a single argument: the input object matching the action's schema,
 * or a FormData instance (flattened to an object before validation).
 * Schemas with no required keys can be called with no argument at all.
 */
export type ServerAction<Raw, Out = unknown> = Record<string, never> extends Raw
  ? (args?: Raw | FormData) => Promise<ActionResult<Out>>
  : (args: Raw | FormData) => Promise<ActionResult<Out>>;

export function createServerAction<In, Out = unknown, Raw = In>(
  options: ServerActionOptions<In, Raw>,
  handler: (args: In) => Promise<ActionResult<Out>>
): ServerAction<Raw, Out> {
  const { schema, actionName } = options;

  const action = async (args?: Raw | FormData): Promise<ActionResult<Out>> => {
    let validatedArgs: In;
    try {
      const input =
        args instanceof FormData
          ? Object.fromEntries(args.entries())
          : args === undefined
            ? {}
            : args;
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

  return action as ServerAction<Raw, Out>;
}

/** Shorthand for createServerAction with the schema and name as positional args. */
export function withValidation<In, Out = unknown, Raw = In>(
  schema: z.ZodType<In, Raw>,
  actionName: string,
  handler: (args: In) => Promise<ActionResult<Out>>
): ServerAction<Raw, Out> {
  return createServerAction<In, Out, Raw>({ schema, actionName }, handler);
}
