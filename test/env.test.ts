import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { validateEnv } from '@/lib/config/env';

const original = process.env.CONTENT_MODERATION_ENABLED;

function parseWith(value: string | undefined) {
  if (value === undefined) {
    delete process.env.CONTENT_MODERATION_ENABLED;
  } else {
    process.env.CONTENT_MODERATION_ENABLED = value;
  }
  return validateEnv();
}

describe('environment feature flags', () => {
  afterEach(() => {
    if (original === undefined) {
      delete process.env.CONTENT_MODERATION_ENABLED;
      return;
    }
    process.env.CONTENT_MODERATION_ENABLED = original;
  });

  it('treats the string "false" as disabled (z.coerce.boolean used to enable it)', () => {
    const result = parseWith('false');
    expect(result.success).to.equal(true);
    if (!result.success) return;
    expect(result.data.CONTENT_MODERATION_ENABLED).to.equal(false);
  });

  it('treats the string "0" as disabled', () => {
    const result = parseWith('0');
    expect(result.success).to.equal(true);
    if (!result.success) return;
    expect(result.data.CONTENT_MODERATION_ENABLED).to.equal(false);
  });

  it('enables moderation only for explicit truthy values', () => {
    for (const value of ['true', '1']) {
      const result = parseWith(value);
      expect(result.success).to.equal(true);
      if (!result.success) continue;
      expect(result.data.CONTENT_MODERATION_ENABLED).to.equal(true);
    }
  });

  it('defaults to disabled when unset', () => {
    const result = parseWith(undefined);
    expect(result.success).to.equal(true);
    if (!result.success) return;
    expect(result.data.CONTENT_MODERATION_ENABLED).to.equal(false);
  });
});

describe('environment integration pairs', () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }
  });

  it('rejects a half-configured Redis integration at boot', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const result = validateEnv();
    expect(result.success).to.equal(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'UPSTASH_REDIS_REST_TOKEN')).to.equal(
      true
    );
  });

  it('accepts a fully configured Redis integration', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    const result = validateEnv();
    expect(result.success).to.equal(true);
  });
});
