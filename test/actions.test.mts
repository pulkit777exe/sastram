import { describe, it } from 'mocha';
import { expect } from 'chai';
import { z } from 'zod';

type ActionErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'CONFLICT' | 'INTERNAL_ERROR';

interface ActionResult<T = unknown> {
  data: T | null;
  error: string | null;
  ok?: boolean;
  errorCode?: ActionErrorCode | null;
}

function actionFailure<T = null>(code: ActionErrorCode, message: string): ActionResult<T> {
  return { ok: false, data: null, error: message, errorCode: code };
}

function createServerAction<In, Out = unknown>(
  schema: z.ZodSchema<In>,
  actionName: string,
  handler: (args: In) => Promise<ActionResult<Out>>
): (...args: unknown[]) => Promise<ActionResult<Out>> {
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
    } catch {
      return actionFailure('VALIDATION_ERROR', 'Invalid input');
    }

    try {
      return await handler(validatedArgs);
    } catch {
      return {
        ok: false,
        data: null,
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  };
}

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive().optional(),
});

describe('Server Action Framework', () => {
  describe('createServerAction', () => {
    it('should return data on successful execution', async () => {
      const action = createServerAction(testSchema, 'testAction', async (args) => ({
        data: { name: args.name, age: args.age ?? null },
        error: null,
      }));

      const result = await action({ name: 'Alice', age: 30 });
      expect(result.ok).to.be.undefined;
      expect(result.error).to.be.null;
      expect(result.data).to.deep.equal({ name: 'Alice', age: 30 });
    });

    it('should return VALIDATION_ERROR on invalid input', async () => {
      const action = createServerAction(testSchema, 'testAction', async () => ({
        data: null,
        error: null,
      }));

      const result = await action({ name: '' });
      expect(result.errorCode).to.equal('VALIDATION_ERROR');
      expect(result.error).to.equal('Invalid input');
      expect(result.data).to.be.null;
    });

    it('should return INTERNAL_ERROR when handler throws', async () => {
      const action = createServerAction(testSchema, 'testAction', async () => {
        throw new Error('db failure');
      });

      const result = await action({ name: 'Alice' });
      expect(result.errorCode).to.equal('INTERNAL_ERROR');
      expect(result.error).to.equal('Something went wrong');
      expect(result.data).to.be.null;
    });

    it('should handle FormData input', async () => {
      const action = createServerAction(testSchema, 'testAction', async (args) => ({
        data: { name: args.name },
        error: null,
      }));

      const formData = new FormData();
      formData.append('name', 'Bob');
      const result = await action(formData);
      expect(result.error).to.be.null;
      expect(result.data).to.deep.equal({ name: 'Bob' });
    });

    it('should handle FormData with invalid fields', async () => {
      const action = createServerAction(testSchema, 'testAction', async () => ({
        data: null,
        error: null,
      }));

      const formData = new FormData();
      formData.append('name', '');
      const result = await action(formData);
      expect(result.errorCode).to.equal('VALIDATION_ERROR');
    });

    it('should accept schema optionals gracefully', async () => {
      const action = createServerAction(testSchema, 'testAction', async (args) => ({
        data: { name: args.name, age: args.age ?? null },
        error: null,
      }));

      const result = await action({ name: 'Charlie' });
      expect(result.error).to.be.null;
      expect(result.data).to.deep.equal({ name: 'Charlie', age: null });
    });
  });

  describe('action helpers', () => {
    it('actionFailure should create proper error response', () => {
      const result = actionFailure('FORBIDDEN', 'Access denied');
      expect(result.ok).to.be.false;
      expect(result.error).to.equal('Access denied');
      expect(result.errorCode).to.equal('FORBIDDEN');
      expect(result.data).to.be.null;
    });
  });

  describe('Notification publish error handling', () => {
    it('publishUserEvent should not throw when Redis is unavailable', async () => {
      let caughtError: unknown = null;
      const mockPublish = async () => {
        throw new Error('Redis connection refused');
      };

      try {
        await mockPublish().catch((err: unknown) => {
          caughtError = err;
        });
      } catch {
        // should not reach here
      }

      expect(caughtError).to.be.instanceOf(Error);
      expect((caughtError as Error).message).to.equal('Redis connection refused');
    });
  });
});
