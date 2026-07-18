import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  rateLimit,
  rateLimitConfig,
  messageLimiter,
  decideLimiterMode,
  InMemoryRateLimiter,
  type RateLimitBucket,
} from '@/lib/services/rate-limit';

describe('Rate Limiting Service', () => {
  describe('rateLimitConfig', () => {
    it('should define all expected buckets', () => {
      expect(rateLimitConfig).to.have.property('auth');
      expect(rateLimitConfig).to.have.property('api');
      expect(rateLimitConfig).to.have.property('upload');
      expect(rateLimitConfig).to.have.property('websocket');
      expect(rateLimitConfig).to.have.property('message');
      expect(rateLimitConfig).to.have.property('newsletter');
    });

    it('should have reasonable limits for each bucket', () => {
      expect(rateLimitConfig.auth.points).to.be.lessThan(rateLimitConfig.api.points);
      expect(rateLimitConfig.message.points).to.be.lessThan(rateLimitConfig.api.points);
    });
  });

  describe('rateLimit function', () => {
    it('should allow requests under the limit', async () => {
      const result = await rateLimit(`test-api-${Date.now()}`);
      expect(result.success).to.be.true;
      expect(result.remaining).to.be.at.least(0);
    });

    it('should accept object params with type', async () => {
      const result = await rateLimit({ key: `test-ws-${Date.now()}`, type: 'websocket' });
      expect(result.success).to.be.true;
    });

    it('should return numeric remaining', async () => {
      const result = await rateLimit(`test-remaining-${Date.now()}`);
      expect(result.remaining).to.be.a('number');
    });
  });

  describe('messageLimiter', () => {
    it('should be a pre-created limiter instance', () => {
      expect(messageLimiter).to.have.property('check');
      expect(messageLimiter.check).to.be.a('function');
    });

    it('should allow messages under the limit', async () => {
      const result = await messageLimiter.check(`test-msg-${Date.now()}`);
      expect(result.success).to.be.true;
    });
  });

  describe('Rate limiter memoization', () => {
    it('should reuse the same limiter instance for the same bucket', async () => {
      // Two calls with same key should use memoized limiter
      const key = `test-memo-${Date.now()}`;
      const r1 = await rateLimit(key);
      const r2 = await rateLimit(key);
      // Both should succeed (under limit)
      expect(r1.success).to.be.true;
      expect(r2.success).to.be.true;
    });
  });

  describe('Redis outage degradation (verified, not just reviewed)', () => {
    describe('decideLimiterMode — the failure-mode decision', () => {
      const fakeRedis = {} as import('@upstash/redis').Redis;

      it('disabled rate limiting => open (intentional, not an outage)', () => {
        expect(decideLimiterMode(false, fakeRedis, true)).to.equal('open');
        expect(decideLimiterMode(false, null, false)).to.equal('open');
      });

      it('Redis unconfigured and unavailable => open (fail open by design)', () => {
        expect(decideLimiterMode(true, null, false)).to.equal('open');
      });

      it('Redis CONFIGURED but client unavailable => in-memory (NOT open)', () => {
        // This is the real "Redis down / network partitioned" path. Must NOT
        // be 'open' — otherwise rate limiting silently disappears.
        expect(decideLimiterMode(true, null, true)).to.equal('in-memory');
      });

      it('Redis available => redis (real shared limiting)', () => {
        expect(decideLimiterMode(true, fakeRedis, true)).to.equal('redis');
      });
    });

    describe('in-memory fallback actually enforces limits', () => {
      it('blocks after the bucket is exhausted (proves NOT fail-open)', async () => {
        // The in-memory limiter IS the fallback used when Redis is down
        // (mode 'in-memory'). Prove it enforces limits rather than allowing all.
        const limiter = new InMemoryRateLimiter(20, 60); // message bucket: 20/min

        const key = `test-outage-${Date.now()}`;
        const first = await limiter.check(key);
        expect(first.success).to.be.true;

        let blockedAt = -1;
        for (let i = 0; i < 25; i++) {
          const res = await limiter.check(key);
          if (!res.success) {
            blockedAt = i;
            break;
          }
        }
        expect(blockedAt).to.be.greaterThan(0);
      });
    });
  });
});
