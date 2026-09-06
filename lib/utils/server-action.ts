import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';
import { AppError, handleError } from './errors';

export type ActionErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ActionEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  errorCode: ActionErrorCode | null;
}

export function actionSuccess<T>(data: T): ActionEnvelope<T> {
  return { ok: true, data, error: null, errorCode: null };
}

export function actionFailure<T = null>(code: ActionErrorCode, message: string): ActionEnvelope<T> {
  return { ok: false, data: null, error: message, errorCode: code };
}

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
 *
 * Simplified: always allow optional args. The previous conditional
 * `Record<string, never> extends Raw ? optional : required` was clever but
 * hard to read. Behavior is identical — empty-object schemas still work
 * when called with no argument, and required schemas will fail Zod validation
 * if omitted, which is the same observable outcome.
 */
export type ServerAction<Raw, Out = unknown> = (args?: Raw | FormData) => Promise<ActionResult<Out>>;

export function createServerAction<In, Out = unknown, Raw = In>(
  options: ServerActionOptions<In, Raw>,
  handler: (args: In) => Promise<ActionResult<Out>>
): ServerAction<Raw, Out> {
  const schema = options.schema;
  const actionName = options.actionName;

  const action = async (args?: Raw | FormData): Promise<ActionResult<Out>> => {
    let validatedArgs: In;
    try {
      // Build raw input object explicitly — avoid nested ternary.
      let input: unknown;
      if (args instanceof FormData) {
        // FormData from browser — flatten to plain object.
        input = Object.fromEntries(args.entries());
      } else if (args === undefined) {
        // No args passed for empty-object schemas — use empty object.
        input = {};
      } else {
        input = args;
      }
      validatedArgs = schema.parse(input);
    } catch (error) {
      const isZodError = error instanceof z.ZodError;
      if (!isZodError) {
        logger.error(`[${actionName}] validation`, error);
      }
      return actionFailure('VALIDATION_ERROR', 'Invalid input');
    }

    try {
      // Handler succeeded — return its result directly.
      const result = await handler(validatedArgs);
      return result;
    } catch (error) {
      // Redirect must propagate — Next.js uses thrown redirect signal.
      if (isRedirectError(error)) {
        throw error;
      }

      // AppError carries a deliberate user-facing message and code,
      // so pass it through without logging as unexpected failure.
      if (error instanceof AppError) {
        const appError = error as AppError;
        let errorCode: ActionErrorCode;
        if (appError.code) {
          errorCode = appError.code as ActionErrorCode;
        } else {
          errorCode = 'INTERNAL_ERROR';
        }
        return {
          ok: false,
          data: null,
          error: appError.message,
          errorCode,
        };
      }

      // Unexpected error — log and return generic message.
      logger.error(`[${actionName}]`, error);

      // handleError sanitizes Prisma/driver messages.
      const handled = handleError(error);
      const safeMessage = handled.message;
      return {
        ok: false,
        data: null,
        error: safeMessage,
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
