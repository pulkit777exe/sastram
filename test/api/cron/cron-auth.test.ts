import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest } from '../helpers';

describe('CRON Auth Verification', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  it('returns 401 when CRON_SECRET is set but no auth header', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const { verifyCronAuth } = require('@/lib/utils/cron-auth');
    const req = mockRequest('/api/cron/update-threads');
    const result = verifyCronAuth(req);

    expect(result).to.not.be.null;
    expect(result.status).to.equal(401);
  });

  it('returns 401 when auth header has wrong secret', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const { verifyCronAuth } = require('@/lib/utils/cron-auth');
    const req = mockRequest('/api/cron/update-threads', {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    const result = verifyCronAuth(req);

    expect(result).to.not.be.null;
    expect(result.status).to.equal(401);
  });

  it('returns null when auth header matches CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const { verifyCronAuth } = require('@/lib/utils/cron-auth');
    const req = mockRequest('/api/cron/update-threads', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const result = verifyCronAuth(req);

    expect(result).to.be.null;
  });

  it('returns null when CRON_SECRET is not set (dev mode)', async () => {
    const originalEnv = process.env.NODE_ENV;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = 'development';
    delete process.env.CRON_SECRET;

    try {
      const { verifyCronAuth } = require('@/lib/utils/cron-auth');
      const req = mockRequest('/api/cron/update-threads');
      const result = verifyCronAuth(req);

      expect(result).to.be.null;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.env as any).NODE_ENV = originalEnv;
    }
  });
});
