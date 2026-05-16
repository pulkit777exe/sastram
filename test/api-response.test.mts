import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
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
