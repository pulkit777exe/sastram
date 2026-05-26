import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { cacheWrap, cacheGet, cacheSet, cacheDel, invalidatePattern } from '@/lib/infrastructure/query-cache';

describe('Query Cache (in-memory fallback)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
  });

  describe('cacheWrap', () => {
    it('should return the value from the factory function on first call', async () => {
      const result = await cacheWrap(['test', 'wrap', '1'], () => Promise.resolve({ hello: 'world' }));
      expect(result).to.deep.equal({ hello: 'world' });
    });

    it('should return cached value on second call without invoking factory', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return { value: callCount };
      };

      const first = await cacheWrap(['test', 'wrap', 'nocall'], fn);
      expect(first).to.deep.equal({ value: 1 });
      expect(callCount).to.equal(1);

      const second = await cacheWrap(['test', 'wrap', 'nocall'], fn);
      expect(second).to.deep.equal({ value: 1 });
      expect(callCount).to.equal(1);
    });

    it('should return cached value from cacheSet + cacheGet', async () => {
      await cacheSet(['test', 'manual'], { data: 42 });
      const result = await cacheGet<{ data: number }>(['test', 'manual']);
      expect(result).to.deep.equal({ data: 42 });
    });

    it('should return null for a non-existent key', async () => {
      const result = await cacheGet(['test', 'nonexistent']);
      expect(result).to.be.null;
    });
  });

  describe('cacheDel', () => {
    it('should remove a cached value', async () => {
      await cacheSet(['test', 'del', 'me'], 'value');
      expect(await cacheGet(['test', 'del', 'me'])).to.equal('value');

      await cacheDel(['test', 'del', 'me']);
      expect(await cacheGet(['test', 'del', 'me'])).to.be.null;
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate all keys matching the pattern prefix', async () => {
      await cacheSet(['users', '1'], { name: 'Alice' });
      await cacheSet(['users', '2'], { name: 'Bob' });
      await cacheSet(['threads', '1'], { title: 'Hello' });

      await invalidatePattern('users');

      expect(await cacheGet(['users', '1'])).to.be.null;
      expect(await cacheGet(['users', '2'])).to.be.null;
      expect(await cacheGet(['threads', '1'])).to.deep.equal({ title: 'Hello' });
    });

    it('should do nothing when no keys match', async () => {
      await cacheSet(['test', 'keep'], 'safe');
      await invalidatePattern('nomatch');
      expect(await cacheGet(['test', 'keep'])).to.equal('safe');
    });
  });

  describe('TTL expiration', () => {
    it('should expire after TTL seconds', async () => {
      await cacheSet(['test', 'ttl'], 'expire-me', 1);

      const before = await cacheGet(['test', 'ttl']);
      expect(before).to.equal('expire-me');

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const after = await cacheGet(['test', 'ttl']);
      expect(after).to.be.null;
    }).timeout(3000);
  });

  describe('cacheWrap with different data types', () => {
    it('should cache a string', async () => {
      const result = await cacheWrap(['type', 'string'], () => Promise.resolve('hello'));
      expect(result).to.equal('hello');
    });

    it('should cache a number', async () => {
      const result = await cacheWrap(['type', 'number'], () => Promise.resolve(42));
      expect(result).to.equal(42);
    });

    it('should cache a boolean', async () => {
      const result = await cacheWrap(['type', 'bool'], () => Promise.resolve(true));
      expect(result).to.equal(true);
    });

    it('should cache an array', async () => {
      const result = await cacheWrap(['type', 'array'], () => Promise.resolve([1, 2, 3]));
      expect(result).to.deep.equal([1, 2, 3]);
    });

    it('should cache null', async () => {
      const result = await cacheWrap(['type', 'null'], () => Promise.resolve(null));
      expect(result).to.equal(null);
    });
  });

  describe('cacheWrap with custom TTL', () => {
    it('should accept custom TTL and expire accordingly', async () => {
      await cacheWrap(['ttl', 'custom'], () => Promise.resolve('short-lived'), 1);

      expect(await cacheGet(['ttl', 'custom'])).to.equal('short-lived');

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await cacheGet(['ttl', 'custom'])).to.be.null;
    }).timeout(3000);
  });
});
