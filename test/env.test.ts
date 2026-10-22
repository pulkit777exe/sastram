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

describe('QStash environment integrity', () => {
  const keys = [
    'QSTASH_URL',
    'QSTASH_TOKEN',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
    'QSTASH_DEV',
  ] as const;
  const originals = new Map<string, string | undefined>();

  for (const key of keys) originals.set(key, process.env[key]);

  function setQstash(values: Partial<Record<(typeof keys)[number], string>>) {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const key of keys) {
      const original = originals.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it('rejects QStash publishing without signing keys', () => {
    setQstash({
      QSTASH_URL: 'https://qstash.upstash.io',
      QSTASH_TOKEN: 'publish-token',
    });

    const result = validateEnv();
    expect(result.success).to.equal(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'QSTASH_CURRENT_SIGNING_KEY')).to.equal(
      true
    );
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'QSTASH_NEXT_SIGNING_KEY')).to.equal(true);
  });

  it('accepts a fully configured QStash integration', () => {
    setQstash({
      QSTASH_URL: 'https://qstash.upstash.io',
      QSTASH_TOKEN: 'publish-token',
      QSTASH_CURRENT_SIGNING_KEY: 'current-key',
      QSTASH_NEXT_SIGNING_KEY: 'next-key',
    });

    const result = validateEnv();
    expect(result.success).to.equal(true);
  });

  it('rejects QSTASH_DEV in production', () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = mutableEnv.NODE_ENV;
    const originalNextPhase = mutableEnv.NEXT_PHASE;
    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.NEXT_PHASE;
    setQstash({ QSTASH_DEV: 'true' });

    try {
      const result = validateEnv();
      expect(result.success).to.equal(false);
      if (result.success) return;
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'QSTASH_DEV')).to.equal(true);
    } finally {
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
      if (originalNextPhase === undefined) delete mutableEnv.NEXT_PHASE;
      else mutableEnv.NEXT_PHASE = originalNextPhase;
    }
  });

  it('allows QSTASH_DEV while next build loads a local .env', () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = mutableEnv.NODE_ENV;
    const originalNextPhase = mutableEnv.NEXT_PHASE;
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.NEXT_PHASE = 'phase-production-build';
    setQstash({ QSTASH_DEV: 'true' });

    try {
      const result = validateEnv();
      expect(result.success).to.equal(true);
    } finally {
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
      if (originalNextPhase === undefined) delete mutableEnv.NEXT_PHASE;
      else mutableEnv.NEXT_PHASE = originalNextPhase;
    }
  });
});
