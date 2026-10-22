import { expect } from 'chai';
import { consumeQuota } from '@/lib/services/daily-quota';
import {
  getSecondsUntilUtcMidnight,
  getUpstashRedis,
  resetUpstashRedis,
} from '@/lib/infrastructure/redis-upstash';

describe('AI Search Quota', function () {
  this.timeout(10_000);
  describe('getSecondsUntilUtcMidnight', () => {
    it('should return a positive number of seconds within a day', () => {
      const result = getSecondsUntilUtcMidnight();
      expect(result).to.be.a('number');
      expect(result).to.be.at.least(1);
      expect(result).to.be.at.most(86400);
    });
  });

  describe('consumeQuota search', () => {
    it('should return numeric remaining and boolean allowed', async () => {
      const result = await consumeQuota('search', 'test-user-id');
      expect(result.allowed).to.be.a('boolean');
      expect(result.remaining).to.be.a('number');
    });

    it('should handle empty user IDs', async () => {
      const result = await consumeQuota('search', '');
      expect(result.allowed).to.be.a('boolean');
    });

    it('should handle long user IDs', async () => {
      const longId = 'a'.repeat(1000);
      const result = await consumeQuota('search', longId);
      expect(result.allowed).to.be.a('boolean');
    });

    it('should count up with repeated calls for the same user', async function () {
      if (!getUpstashRedis()) {
        this.skip();
        return;
      }
      const userId = 'quota-test-user';
      const first = await consumeQuota('search', userId);
      expect(first.remaining).to.be.at.least(0);

      const second = await consumeQuota('search', userId);
      expect(second.remaining).to.be.at.most(first.remaining);
    });

    it('fails closed when Redis is unavailable in production', async () => {
      const mutableEnv = process.env as Record<string, string | undefined>;
      const savedUrl = mutableEnv.UPSTASH_REDIS_REST_URL;
      const savedToken = mutableEnv.UPSTASH_REDIS_REST_TOKEN;
      const savedNodeEnv = mutableEnv.NODE_ENV;

      delete mutableEnv.UPSTASH_REDIS_REST_URL;
      delete mutableEnv.UPSTASH_REDIS_REST_TOKEN;
      mutableEnv.NODE_ENV = 'production';
      resetUpstashRedis();

      try {
        const result = await consumeQuota('search', 'prod-quota-test-user');
        expect(result).to.deep.equal({ allowed: false, remaining: 0 });
      } finally {
        if (savedUrl === undefined) delete mutableEnv.UPSTASH_REDIS_REST_URL;
        else mutableEnv.UPSTASH_REDIS_REST_URL = savedUrl;
        if (savedToken === undefined) delete mutableEnv.UPSTASH_REDIS_REST_TOKEN;
        else mutableEnv.UPSTASH_REDIS_REST_TOKEN = savedToken;
        if (savedNodeEnv === undefined) delete mutableEnv.NODE_ENV;
        else mutableEnv.NODE_ENV = savedNodeEnv;
        resetUpstashRedis();
      }
    });
  });
});
