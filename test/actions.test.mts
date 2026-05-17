import { describe, it } from 'mocha';
import { expect } from 'chai';
import { z } from 'zod';
import { createServerAction, withValidation } from '@/lib/utils/server-action';

describe('Server Action Framework (real implementation)', () => {
  describe('createServerAction', () => {
    it('should return data on successful execution', async () => {
      const action = createServerAction(
        { schema: z.object({ name: z.string(), age: z.number().int().positive().optional() }), actionName: 'testAction' },
        async (args) => ({
          data: { name: args.name, age: args.age ?? null },
          error: null,
        })
      );

      const result = await action({ name: 'Alice', age: 30 });
      expect(result.error).to.be.null;
      expect(result.data).to.deep.equal({ name: 'Alice', age: 30 });
    });

    it('should return VALIDATION_ERROR on invalid input', async () => {
      const action = createServerAction(
        { schema: z.object({ name: z.string().min(1) }), actionName: 'testAction' },
        async () => ({ data: null, error: null })
      );

      const result = await action({ name: '' });
      expect(result.errorCode).to.equal('VALIDATION_ERROR');
      expect(result.data).to.be.null;
    });

    it('should return INTERNAL_ERROR when handler throws', async () => {
      const action = createServerAction(
        { schema: z.object({ name: z.string() }), actionName: 'testAction' },
        async () => { throw new Error('db failure'); }
      );

      const result = await action({ name: 'Alice' });
      expect(result.errorCode).to.equal('INTERNAL_ERROR');
      expect(result.data).to.be.null;
    });

    it('should accept schema optionals gracefully', async () => {
      const action = createServerAction(
        { schema: z.object({ name: z.string(), age: z.number().int().positive().optional() }), actionName: 'testAction' },
        async (args) => ({ data: { name: args.name, age: args.age ?? null }, error: null })
      );

      const result = await action({ name: 'Charlie' });
      expect(result.error).to.be.null;
      expect(result.data).to.deep.equal({ name: 'Charlie', age: null });
    });
  });

  describe('withValidation', () => {
    it('should validate input and return data on success', async () => {
      const action = withValidation(
        z.object({ name: z.string().min(1) }),
        'testAction',
        async (args) => ({ data: { name: args.name }, error: null })
      );

      const result = await action({ name: 'Bob' });
      expect(result.error).to.be.null;
      expect(result.data).to.deep.equal({ name: 'Bob' });
    });

    it('should return error on invalid input', async () => {
      const action = withValidation(
        z.object({ name: z.string().min(1) }),
        'testAction',
        async () => ({ data: null, error: null })
      );

      const result = await action({ name: '' });
      expect(result.error).to.not.be.null;
      expect(result.data).to.be.null;
    });

    it('should catch handler errors and return error response', async () => {
      const action = withValidation(
        z.object({ name: z.string() }),
        'testAction',
        async () => { throw new Error('db failure'); }
      );

      const result = await action({ name: 'Alice' });
      expect(result.error).to.not.be.null;
      expect(result.data).to.be.null;
    });
  });
});
