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
