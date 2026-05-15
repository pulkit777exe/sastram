import { describe, it } from 'mocha';
import { expect } from 'chai';
import { generateRequestId } from '../lib/infrastructure/logger';

describe('Logger', () => {
  describe('generateRequestId', () => {
    it('should generate a string starting with req_', () => {
      const id = generateRequestId();
      expect(id).to.be.a('string');
      expect(id.startsWith('req_')).to.be.true;
    });

    it('should produce unique values across calls', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).to.equal(100);
    });

    it('should produce consistent length', () => {
      const ids = Array.from({ length: 10 }, () => generateRequestId());
      const length = ids[0].length;
      ids.forEach((id) => expect(id.length).to.equal(length));
    });
  });
});
