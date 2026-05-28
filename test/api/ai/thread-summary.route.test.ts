import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, restoreStubs } from '../helpers';

const POST = () => require('@/app/api/ai/thread-summary/route').POST;

describe('POST /api/ai/thread-summary', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubAuth(null));

    const res = await POST()(mockRequest('/api/ai/thread-summary', {
      method: 'POST',
      body: { threadId: 't1' },
    }));
    const body = await res.json();
    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 400 when threadId is missing', async () => {
    const res = await POST()(mockRequest('/api/ai/thread-summary', {
      method: 'POST',
      body: {},
    }));
    const body = await res.json();
    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});
