import { describe, it } from 'mocha';
import { expect } from 'chai';
import { getUpstashRedis, getSecondsUntilUtcMidnight, ATOMIC_INCR_EXPIRE_LUA } from '@/lib/infrastructure/redis-upstash';

describe('Redis Upstash Infrastructure', () => {
  describe('getUpstashRedis', () => {
    it('should return a Redis client when env vars are set', () => {
      const client = getUpstashRedis();
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        expect(client).to.not.be.null;
      } else {
        expect(client).to.be.null;
      }
    });

    it('should return the same client on repeated calls (singleton)', () => {
      const first = getUpstashRedis();
      const second = getUpstashRedis();
      expect(first).to.equal(second);
    });
  });

  describe('getSecondsUntilUtcMidnight', () => {
    it('should return a positive number of seconds within a day', () => {
      const result = getSecondsUntilUtcMidnight();
      expect(result).to.be.a('number');
      expect(result).to.be.at.least(1);
      expect(result).to.be.at.most(86400);
    });
  });

  describe('ATOMIC_INCR_EXPIRE_LUA', () => {
    it('should be a valid Lua script string', () => {
      expect(ATOMIC_INCR_EXPIRE_LUA).to.be.a('string');
      expect(ATOMIC_INCR_EXPIRE_LUA).to.include('INCR');
      expect(ATOMIC_INCR_EXPIRE_LUA).to.include('EXPIRE');
    });
  });
});
