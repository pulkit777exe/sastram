import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest } from '../helpers';

const POST = () => require('@/app/api/newsletter/generate/route').POST;

describe('POST /api/newsletter/generate', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  it('returns 401 when cron secret is missing', async () => {
    process.env.CRON_SECRET = 'test-secret-32-chars-minimum-required';

    const res = await POST()(mockRequest('/api/newsletter/generate', {
      method: 'POST',
      body: {},
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
  });

  it('returns 401 when cron secret is wrong', async () => {
    process.env.CRON_SECRET = 'test-secret-32-chars-minimum-required';

    const res = await POST()(mockRequest('/api/newsletter/generate', {
      method: 'POST',
      body: {},
      headers: { Authorization: 'Bearer wrong-secret' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
  });
});
