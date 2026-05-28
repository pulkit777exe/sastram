import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, restoreStubs } from './helpers';

const POST = () => require('@/app/api/newsletter/generate/route').POST;

describe('POST /api/newsletter/generate', () => {
  let stubs: sinon.SinonStub[] = [];
  let originalCronSecret: string | undefined;

  beforeEach(() => {
    originalCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret-thirtytwocharsmin';
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    process.env.CRON_SECRET = originalCronSecret;
  });

  it('returns 401 when cron secret is missing', async () => {
    const res = await POST()(mockRequest('/api/newsletter/generate', {
      method: 'POST',
      headers: {},
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
  });

  it('returns 401 when cron secret is wrong', async () => {
    const res = await POST()(mockRequest('/api/newsletter/generate', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
  });
});
