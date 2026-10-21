import { describe, it } from 'mocha';
import { expect } from 'chai';
import { NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '../lib/utils/api-response';
import { mockRequest } from './api/helpers';

describe('API Response Helpers', () => {
  describe('ok', () => {
    it('should return success with data', () => {
      const response = ok({ id: '1' });
      expect(response.success).to.be.true;
      expect(response.data).to.deep.equal({ id: '1' });
      expect(response.metadata).to.have.property('timestamp');
    });
  });

  describe('fail', () => {
    it('should return failure with error code and message', () => {
      const response = fail('VALIDATION_ERROR', 'Bad request');
      expect(response.success).to.be.false;
      expect(response.error?.code).to.equal('VALIDATION_ERROR');
      expect(response.error?.message).to.equal('Bad request');
    });

    it('should include details when provided', () => {
      const response = fail('VALIDATION_ERROR', 'Invalid', { field: 'email' });
      expect(response.error?.details).to.deep.equal({ field: 'email' });
    });
  });

  describe('withErrorHandling request correlation', () => {
    it('reuses the proxy request id on success and in the body metadata', async () => {
      const handler = withErrorHandling(async (request) => {
        const requestId = request.headers.get('x-request-id') ?? '';
        return NextResponse.json(ok({ fine: true }, requestId));
      });

      const response = await handler(mockRequest('/api/test', { headers: { 'x-request-id': 'req_proxy_123' } }));
      const body = await response.json();

      expect(response.headers.get('x-request-id')).to.equal('req_proxy_123');
      expect(body.metadata.requestId).to.equal('req_proxy_123');
    });

    it('falls back to a generated id when the proxy header is absent', async () => {
      const handler = withErrorHandling(async () => NextResponse.json(ok({})));

      const response = await handler(mockRequest('/api/test'));

      expect(response.headers.get('x-request-id')).to.match(/^req_/);
    });
  });
});
