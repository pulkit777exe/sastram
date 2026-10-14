import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import {
  claimOnce,
  consumeIdempotencyKey,
  ttlForScope,
  JOB_DEDUP_TTL_SECONDS,
} from '../lib/services/idempotency';
import { deduplicateJob, jobDedupKey } from '../lib/services/job-dedup';
import { resetUpstashRedis } from '../lib/infrastructure/redis-upstash';

describe('exactly-once seam', () => {
  describe('ttlForScope', () => {
    it('job scope is the QStash retry window', () => {
      expect(ttlForScope('job')).to.equal(JOB_DEDUP_TTL_SECONDS);
      expect(ttlForScope('job')).to.equal(3600);
    });

    it('request scope respects the 60s floor', () => {
      expect(ttlForScope('request')).to.be.greaterThanOrEqual(60);
    });
  });

  describe('jobDedupKey', () => {
    it('namespaces job rows off the request-claim space', () => {
      expect(jobDedupKey('abc')).to.equal('job:dedup:abc');
    });
  });

  // Hermetic fail-open proof: force getUpstashRedis() to null regardless of
  // which .env files other import chains merged (lib/infrastructure/prisma.ts
  // runs dotenv/config at import time, so .env can leak over .env.test).
  describe('fail-open without Redis', () => {
    let savedUrl: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
      savedUrl = process.env.UPSTASH_REDIS_REST_URL;
      savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      resetUpstashRedis();
    });

    afterEach(() => {
      if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl;
      if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
      resetUpstashRedis();
    });
    it('claimOnce allows', async () => {
      expect(await claimOnce('any-key')).to.equal(true);
    });

    it('consumeIdempotencyKey allows', async () => {
      expect(await consumeIdempotencyKey('any-key')).to.equal(true);
    });

    it('deduplicateJob allows (runs rather than drops)', async () => {
      expect(await deduplicateJob('any-job')).to.equal(true);
    });
  });
});
