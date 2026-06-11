import { describe, it } from 'mocha';
import { expect } from 'chai';
import { ok, fail } from '../lib/utils/api-response';

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
});
