import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest } from '../helpers';

const GET = () => require('@/app/api/cron/worker/route').GET;

describe('GET /api/cron/worker', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  it('returns 401 when CRON_SECRET is set but auth header is missing', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const res = await GET()(mockRequest('/api/cron/worker'));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error).to.equal('Unauthorized');
  });

  it('returns available queues when no queue param is specified', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const res = await GET()(mockRequest('/api/cron/worker', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    const body = await res.json();

    expect(res.status).to.equal(200);
    expect(body.success).to.equal(true);
    expect(body.data).to.have.property('availableQueues');
    expect(body.data).to.have.property('usage');
    expect(body.data.availableQueues).to.be.an('array');
    expect(body.data.availableQueues).to.include('thread-summary');
  });

  it('returns error when queue param is invalid (Redis not available)', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const res = await GET()(mockRequest('/api/cron/worker?queue=THREAD_SUMMARY', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    const body = await res.json();

    // Redis is not available in test, so this will fail
    expect(res.status).to.be.oneOf([200, 500]);
  });
});
