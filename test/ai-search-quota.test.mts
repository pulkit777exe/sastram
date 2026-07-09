import { expect } from 'chai';
import { consumeAiSearchQuota } from '@/lib/services/ai-search-quota';
import { getSecondsUntilUtcMidnight, getUpstashRedis } from '@/lib/infrastructure/redis-upstash';

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

  describe('consumeAiSearchQuota', () => {
    it('should return numeric remaining and boolean allowed', async () => {
      const result = await consumeAiSearchQuota('test-user-id');
      expect(result.allowed).to.be.a('boolean');
      expect(result.remaining).to.be.a('number');
    });

    it('should handle empty user IDs', async () => {
      const result = await consumeAiSearchQuota('');
      expect(result.allowed).to.be.a('boolean');
    });

    it('should handle long user IDs', async () => {
      const longId = 'a'.repeat(1000);
      const result = await consumeAiSearchQuota(longId);
      expect(result.allowed).to.be.a('boolean');
    });

    it('should count up with repeated calls for the same user', async function () {
      if (!getUpstashRedis()) {
        this.skip();
        return;
      }
      const userId = 'quota-test-user';
      const first = await consumeAiSearchQuota(userId);
      expect(first.remaining).to.be.at.least(0);

      const second = await consumeAiSearchQuota(userId);
      expect(second.remaining).to.be.at.most(first.remaining);
    });
  });
});
