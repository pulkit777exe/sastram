import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  rateLimitResponse,
  serverErrorResponse,
  validationErrorResponse,
} from '../lib/utils/api-response';

describe('API Response Helpers', () => {
  describe('successResponse', () => {
    it('should return 200 with data', async () => {
      const res = await successResponse({ id: '1' });
      expect(res.status).to.equal(200);
      const body = await res.json();
      expect(body.data).to.deep.equal({ id: '1' });
    });
  });

  describe('errorResponse', () => {
    it('should return 400 with error message', async () => {
      const res = await errorResponse('Bad request');
      expect(res.status).to.equal(400);
      const body = await res.json();
      expect(body.error).to.equal('Bad request');
    });
  });

  describe('unauthorizedResponse', () => {
    it('should return 401 with UNAUTHORIZED code', async () => {
      const res = await unauthorizedResponse();
      expect(res.status).to.equal(401);
      const body = await res.json();
      expect(body.error).to.equal('Unauthorized');
      expect(body.code).to.equal('UNAUTHORIZED');
    });
  });

  describe('forbiddenResponse', () => {
    it('should return 403 with FORBIDDEN code', async () => {
      const res = await forbiddenResponse();
      expect(res.status).to.equal(403);
      const body = await res.json();
      expect(body.error).to.equal('Forbidden');
      expect(body.code).to.equal('FORBIDDEN');
    });
  });

  describe('notFoundResponse', () => {
    it('should return 404 with resource name', async () => {
      const res = await notFoundResponse('Thread');
      expect(res.status).to.equal(404);
      const body = await res.json();
      expect(body.error).to.equal('Thread not found');
      expect(body.code).to.equal('NOT_FOUND');
    });
  });

  describe('rateLimitResponse', () => {
    it('should return 429 with RATE_LIMIT code', async () => {
      const res = await rateLimitResponse();
      expect(res.status).to.equal(429);
      const body = await res.json();
      expect(body.error).to.equal('Rate limit exceeded');
      expect(body.code).to.equal('RATE_LIMIT');
    });
  });

  describe('serverErrorResponse', () => {
    it('should return 500 with INTERNAL_ERROR code', async () => {
      const res = await serverErrorResponse();
      expect(res.status).to.equal(500);
      const body = await res.json();
      expect(body.error).to.equal('Internal server error');
      expect(body.code).to.equal('INTERNAL_ERROR');
    });
  });

  describe('validationErrorResponse', () => {
    it('should return 400 with details array', async () => {
      const res = await validationErrorResponse(['email is required', 'name too short']);
      expect(res.status).to.equal(400);
      const body = await res.json();
      expect(body.error).to.equal('Validation failed');
      expect(body.details).to.deep.equal(['email is required', 'name too short']);
    });
  });
});
