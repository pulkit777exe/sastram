import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { rateLimitConfig } from '../lib/services/rate-limit';

describe('Rate Limit Service', () => {
  describe('Rate Limit Configuration', () => {
    it('should have auth bucket configured', () => {
      expect(rateLimitConfig.auth.points).to.equal(5);
      expect(rateLimitConfig.auth.duration).to.equal(900);
    });

    it('should have api bucket configured', () => {
      expect(rateLimitConfig.api.points).to.equal(100);
      expect(rateLimitConfig.api.duration).to.equal(60);
    });

    it('should have websocket bucket configured', () => {
      expect(rateLimitConfig.websocket.points).to.equal(50);
      expect(rateLimitConfig.websocket.duration).to.equal(60);
    });

    it('should have message bucket configured', () => {
      expect(rateLimitConfig.message.points).to.equal(20);
      expect(rateLimitConfig.message.duration).to.equal(60);
    });

    it('should have upload bucket configured', () => {
      expect(rateLimitConfig.upload.points).to.equal(10);
      expect(rateLimitConfig.upload.duration).to.equal(3600);
    });
  });
});