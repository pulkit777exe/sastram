import { describe, it } from 'mocha';
import { expect } from 'chai';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseWith, readJsonBody, parseJsonBody, parseQueryParam } from '../modules/collections/handler';
import { AppError } from '../lib/utils/errors';

const nameSchema = z.object({ name: z.string().min(1) });
const idSchema = z.string().min(1);

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/collections', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('collections handler validation seam', () => {
  describe('parseWith', () => {
    it('returns data on success', () => {
      expect(parseWith(nameSchema, { name: 'x' })).to.deep.equal({ name: 'x' });
    });

    it('throws VALIDATION_ERROR 400 with the first issue message', () => {
      try {
        parseWith(nameSchema, { name: '' });
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('VALIDATION_ERROR');
        expect((error as AppError).statusCode).to.equal(400);
      }
    });
  });

  describe('readJsonBody', () => {
    it('parses valid JSON', async () => {
      expect(await readJsonBody(jsonRequest({ a: 1 }))).to.deep.equal({ a: 1 });
    });

    it('throws VALIDATION_ERROR 400 on malformed JSON', async () => {
      try {
        await readJsonBody(jsonRequest('{nope'));
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as AppError).code).to.equal('VALIDATION_ERROR');
        expect((error as AppError).statusCode).to.equal(400);
      }
    });
  });

  describe('parseJsonBody', () => {
    it('parses and validates in one step', async () => {
      expect(await parseJsonBody(jsonRequest({ name: 'y' }), nameSchema)).to.deep.equal({ name: 'y' });
    });

    it('schema failure is a 400, not a 500', async () => {
      try {
        await parseJsonBody(jsonRequest({ name: '' }), nameSchema);
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as AppError).code).to.equal('VALIDATION_ERROR');
        expect((error as AppError).statusCode).to.equal(400);
      }
    });
  });

  describe('parseQueryParam', () => {
    it('returns the validated value', () => {
      expect(parseQueryParam(new URLSearchParams('itemId=abc'), 'itemId', idSchema)).to.equal('abc');
    });

    it('missing param throws BAD_REQUEST 400', () => {
      try {
        parseQueryParam(new URLSearchParams(''), 'itemId', idSchema);
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as AppError).code).to.equal('BAD_REQUEST');
        expect((error as AppError).statusCode).to.equal(400);
      }
    });
  });
});
