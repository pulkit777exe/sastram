import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';
import { serverError } from './validation-common';

/**
 * Server action result type
 */
export interface ActionResult<T = unknown> {
  data: T | null;
  error: string | null;
}

/**
 * Options for createServerAction
 */
export interface ServerActionOptions<In, Out = unknown> {
  schema: z.ZodSchema<In>;
  actionName: string;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireRole?: string[];
  getSession?: () => Promise<{ user: { id: string; role?: string } } | null>;
}

/**
 * Wrap a server action handler with validation, error handling, and optionally auth checks
 */
export function createServerAction<In, Out = unknown>(
  options: ServerActionOptions<In, Out>,
  handler: (args: In) => Promise<ActionResult<Out>>
): (...args: unknown[]) => Promise<ActionResult<Out>> {
  const { schema, actionName, requireAuth, requireAdmin, requireRole, getSession } = options;

  return async (...handlerArgs: unknown[]): Promise<ActionResult<Out>> => {
    // Validate input
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
        return { data: null, error: 'Invalid input' };
      }
      logger.error(`[${actionName}] validation`, error);
      return { data: null, error: 'Invalid input' };
    }

    // Authentication checks
    if (requireAuth || requireAdmin || requireRole) {
      if (!getSession) {
        throw new Error(`getSession is required for auth checks in ${actionName}`);
      }
      try {
        const session = await getSession();
        if (!session?.user) {
          return { data: null, error: 'Authentication required' };
        }
        if (requireAdmin && !['ADMIN', 'MODERATOR'].includes(session.user.role || '')) {
          return { data: null, error: 'Insufficient permissions' };
        }
        if (requireRole && session.user.role && !requireRole.includes(session.user.role)) {
          return { data: null, error: 'Insufficient permissions' };
        }
      } catch (error) {
        logger.error(`[${actionName}] auth`, error);
        return { data: null, error: 'Authentication required' };
      }
    }

    // Execute handler
    try {
      return await handler(validatedArgs);
    } catch (error) {
      logger.error(`[${actionName}]`, error);
      return serverError();
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
