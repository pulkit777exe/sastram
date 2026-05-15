import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  handleError,
} from '../lib/utils/errors';

describe('Error Handling', () => {
  describe('AppError', () => {
    it('should create with message and defaults', () => {
      const err = new AppError('Something went wrong');
      expect(err.message).to.equal('Something went wrong');
      expect(err.code).to.be.undefined;
      expect(err.statusCode).to.equal(500);
      expect(err.name).to.equal('AppError');
    });

    it('should create with code and statusCode', () => {
      const err = new AppError('Custom error', 'CUSTOM_CODE', 418);
      expect(err.message).to.equal('Custom error');
      expect(err.code).to.equal('CUSTOM_CODE');
      expect(err.statusCode).to.equal(418);
    });
  });

  describe('ValidationError', () => {
    it('should create with 400 status and VALIDATION_ERROR code', () => {
      const err = new ValidationError('Invalid input');
      expect(err.message).to.equal('Invalid input');
      expect(err.code).to.equal('VALIDATION_ERROR');
      expect(err.statusCode).to.equal(400);
    });
  });

  describe('AuthenticationError', () => {
    it('should create with 401 status and default message', () => {
      const err = new AuthenticationError();
      expect(err.message).to.equal('Authentication required');
      expect(err.code).to.equal('AUTHENTICATION_ERROR');
      expect(err.statusCode).to.equal(401);
    });
  });

  describe('AuthorizationError', () => {
    it('should create with 403 status', () => {
      const err = new AuthorizationError();
      expect(err.message).to.equal('Insufficient permissions');
      expect(err.code).to.equal('AUTHORIZATION_ERROR');
      expect(err.statusCode).to.equal(403);
    });
  });

  describe('NotFoundError', () => {
    it('should create with 404 status and resource name', () => {
      const err = new NotFoundError('User');
      expect(err.message).to.equal('User not found');
      expect(err.code).to.equal('NOT_FOUND');
      expect(err.statusCode).to.equal(404);
    });

    it('should use default message when no resource given', () => {
      const err = new NotFoundError();
      expect(err.message).to.equal('Resource not found');
    });
  });

  describe('RateLimitError', () => {
    it('should create with 429 status', () => {
      const err = new RateLimitError();
      expect(err.message).to.equal('Rate limit exceeded');
      expect(err.code).to.equal('RATE_LIMIT_ERROR');
      expect(err.statusCode).to.equal(429);
    });
  });

  describe('handleError', () => {
    it('should handle AppError instances', () => {
      const result = handleError(new NotFoundError('Thread'));
      expect(result.message).to.equal('Thread not found');
      expect(result.code).to.equal('NOT_FOUND');
      expect(result.statusCode).to.equal(404);
    });

    it('should handle generic Error instances', () => {
      const result = handleError(new Error('Something broke'));
      expect(result.message).to.equal('Something broke');
      expect(result.code).to.equal('INTERNAL_ERROR');
      expect(result.statusCode).to.equal(500);
    });

    it('should handle unknown errors', () => {
      const result = handleError('string error');
      expect(result.message).to.equal('An unexpected error occurred');
      expect(result.code).to.equal('UNKNOWN_ERROR');
      expect(result.statusCode).to.equal(500);
    });

    it('should handle null/undefined', () => {
      const result = handleError(null);
      expect(result.message).to.equal('An unexpected error occurred');
      expect(result.statusCode).to.equal(500);
    });
  });
});
