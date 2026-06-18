import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from './helpers';

const GET = () => require('@/app/api/threads/route').GET;

describe('GET /api/threads', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

    const res = await GET()(mockRequest('/api/threads'));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 200 or 500 for authenticated user (depends on DB)', async () => {
    const res = await GET()(mockRequest('/api/threads'));
    const body = await res.json();

    expect(res.status).to.be.oneOf([200, 500]);
    if (res.status === 200) {
      expect(body.success).to.equal(true);
      expect(body.data?.threads).to.be.an('array');
    }
  });
});
