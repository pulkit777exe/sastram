import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  AppError,
  handleError,
  prismaErrorMessage,
  isPrismaUniqueConstraintError,
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

  describe('handleError', () => {
    it('should handle AppError instances', () => {
      const result = handleError(new AppError('Thread not found', 'NOT_FOUND', 404));
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

    it('should translate Prisma unique constraint error', () => {
      const err = { code: 'P2002', meta: { modelName: 'User' } };
      const result = handleError(err);
      expect(result.message).to.equal('This record already exists');
      expect(result.statusCode).to.equal(409);
    });

    it('should translate Prisma record not found error', () => {
      const err = { code: 'P2025', meta: { modelName: 'Message' } };
      const result = handleError(err);
      expect(result.message).to.equal('Record not found');
      expect(result.statusCode).to.equal(409);
    });

    it('should translate Prisma foreign key error', () => {
      const err = { code: 'P2003', meta: { modelName: 'Message' } };
      const result = handleError(err);
      expect(result.message).to.equal('Related record not found');
      expect(result.statusCode).to.equal(409);
    });
  });

  describe('prismaErrorMessage', () => {
    it('should return message for P2002', () => {
      expect(prismaErrorMessage({ code: 'P2002' })).to.equal('This record already exists');
    });

    it('should return message for P2025', () => {
      expect(prismaErrorMessage({ code: 'P2025' })).to.equal('Record not found');
    });

    it('should return message for P2003', () => {
      expect(prismaErrorMessage({ code: 'P2003' })).to.equal('Related record not found');
    });

    it('should return null for unknown error codes', () => {
      expect(prismaErrorMessage({ code: 'P9999' })).to.be.null;
    });

    it('should return null for non-Prisma errors', () => {
      expect(prismaErrorMessage(new Error('db error'))).to.be.null;
    });

    it('should return null for null/undefined', () => {
      expect(prismaErrorMessage(null)).to.be.null;
      expect(prismaErrorMessage(undefined)).to.be.null;
    });
  });

  describe('isPrismaUniqueConstraintError', () => {
    it('should return true for P2002', () => {
      expect(isPrismaUniqueConstraintError({ code: 'P2002' })).to.be.true;
    });

    it('should return false for other errors', () => {
      expect(isPrismaUniqueConstraintError({ code: 'P2025' })).to.be.false;
      expect(isPrismaUniqueConstraintError(new Error('fail'))).to.be.false;
      expect(isPrismaUniqueConstraintError(null)).to.be.false;
    });
  });
});
