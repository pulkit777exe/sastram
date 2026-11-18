import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { mockRequest } from '../helpers';

const GET = () => require('@/app/api/cron/update-threads/route').GET;

describe('GET /api/cron/update-threads', () => {
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

    const res = await GET()(mockRequest('/api/cron/update-threads'));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error).to.equal('Unauthorized');
  });

  it('returns 401 when auth header has wrong secret', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';

    const res = await GET()(mockRequest('/api/cron/update-threads', {
      headers: { Authorization: 'Bearer wrong-secret' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error).to.equal('Unauthorized');
  });

  it('does not trigger knowledge promotion from the update-threads cron', () => {
    // The standalone promote-knowledge cron is the only trigger. Static source
    // read keeps this cheap and avoids stubbing every dependency of the route.
    const source = readFileSync(require.resolve('@/app/api/cron/update-threads/route'), 'utf8');

    expect(source).to.not.include('promoteThreadsToKnowledgePages');
    expect(source).to.not.include('knowledgePages');
  });
});
