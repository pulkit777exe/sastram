import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';
import { serverError } from './validation-common';
import { actionFailure, type ActionErrorCode } from '@/lib/actions/result';

/**
 * Server action result type
 */
export interface ActionResult<T = unknown> {
  data: T | null;
  error: string | null;
  ok?: boolean;
  errorCode?: ActionErrorCode | null;
}

/**
 * Options for createServerAction
 */
export interface ServerActionOptions<In, Out = unknown> {
  schema: z.ZodSchema<In>;
  actionName: string;
}

/**
 * Wrap a server action handler with validation and error handling
 */
export function createServerAction<In, Out = unknown>(
  options: ServerActionOptions<In, Out>,
  handler: (args: In) => Promise<ActionResult<Out>>
): (...args: unknown[]) => Promise<ActionResult<Out>> {
  const { schema, actionName } = options;

  return async (...handlerArgs: unknown[]): Promise<ActionResult<Out>> => {
    let validatedArgs: In;
    try {
      if (handlerArgs.length === 1 && handlerArgs[0] instanceof FormData) {
        const formData = handlerArgs[0] as FormData;
        const dataObj: Record<string, unknown> = {};
        for (const [key, value] of formData.entries()) {
          dataObj[key] = value;
        }
        validatedArgs = schema.parse(dataObj);
      } else {
        const input = handlerArgs.length === 1 ? handlerArgs[0] : handlerArgs;
        validatedArgs = schema.parse(input);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return actionFailure('VALIDATION_ERROR', 'Invalid input');
      }
      logger.error(`[${actionName}] validation`, error);
      return actionFailure('VALIDATION_ERROR', 'Invalid input');
    }

    try {
      return await handler(validatedArgs);
    } catch (error) {
      logger.error(`[${actionName}]`, error);
      return {
        ok: false,
        data: null,
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  };
}

/**
 * Simple variant: only validation + error handling
 */
export function withValidation<In, Out = unknown>(
  schema: z.ZodSchema<In>,
  actionName: string,
  handler: (args: In) => Promise<ActionResult<Out>>
) {
  return createServerAction<In, Out>({ schema, actionName }, handler);
}
