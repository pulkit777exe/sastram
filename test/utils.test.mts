import { describe, it } from 'mocha';
import { expect } from 'chai';
import { slugify } from '@/lib/utils/slug';
import { rateLimitConfig } from '@/lib/services/rate-limit';

describe('Real Utilities', () => {
  describe('slugify', () => {
    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).to.equal('hello-world');
    });

    it('should trim whitespace', () => {
      expect(slugify('  hello  ')).to.equal('hello');
    });

    it('should replace spaces with hyphens', () => {
      expect(slugify('hello world test')).to.equal('hello-world-test');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello @World!')).to.equal('hello-world');
    });

    it('should handle empty strings', () => {
      expect(slugify('')).to.equal('');
    });

    it('should handle unicode characters', () => {
      expect(slugify('Héllo Wörld')).to.equal('h-llo-w-rld');
    });
  });

  describe('Rate Limit Config', () => {
    it('should have all expected buckets', () => {
      expect(rateLimitConfig).to.have.property('auth');
      expect(rateLimitConfig).to.have.property('api');
      expect(rateLimitConfig).to.have.property('upload');
      expect(rateLimitConfig).to.have.property('websocket');
      expect(rateLimitConfig).to.have.property('message');
      expect(rateLimitConfig).to.have.property('newsletter');
    });

    it('should have reasonable auth limits', () => {
      expect(rateLimitConfig.auth.points).to.equal(5);
      expect(rateLimitConfig.auth.duration).to.equal(900);
    });

    it('should have reasonable message limits', () => {
      expect(rateLimitConfig.message.points).to.equal(20);
      expect(rateLimitConfig.message.duration).to.equal(60);
    });
  });
});
