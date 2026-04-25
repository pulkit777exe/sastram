import { logger } from '@/lib/infrastructure/logger';
import { serverError } from './validation-common';

/**
 * Server action result type
 */
export interface ActionResult<T = unknown> {
  data: T | null;
  error: string | null;
}

/**
 * Wrap a server action handler with validation, error handling, and optionally auth checks
 *
 * Features:
 * - Automatic Zod schema validation (supports FormData or direct object args)
 * - Consistent error logging
 * - Optional authentication/admin checks
 *
 * Usage:
 *   export const getUserAction = createServerAction(
 *     { schema: userIdSchema, actionName: 'getUser', requireAuth: true },
 *     async ({ userId }) => {
 *       const user = await getUser(userId);
 *       return { data: user, error: null };
 *     }
 *   );
 */
export function createServerAction<Schema extends z.ZodSchema<any>>(
  options: {
    schema: Schema;
    actionName: string;
    requireAuth?: boolean;
    requireAdmin?: boolean;
    requireRole?: string[];
    getSession?: () => Promise<{ user: { id: string; role?: string } } | null>;
  },
  handler: (args: z.infer<Schema>) => Promise<ActionResult>
) {
  const { schema, actionName, requireAuth, requireAdmin, requireRole, getSession } = options;

  return async (...handlerArgs: unknown[]): Promise<ActionResult> => {
    // Validate input
    let validatedArgs: z.infer<Schema>;
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
export function withValidation<Schema extends z.ZodSchema<any>>(
  schema: Schema,
  actionName: string,
  handler: (args: z.infer<Schema>) => Promise<ActionResult>
) {
  return createServerAction({ schema, actionName }, handler);
}
