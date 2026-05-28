import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, restoreStubs } from './helpers';

const GET = () => require('@/app/api/conversations/route').GET;
const POST = () => require('@/app/api/conversations/route').POST;

describe('GET /api/conversations', () => {
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

    const res = await GET()(mockRequest('/api/conversations'));
    const body = await res.json();
    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });
});

describe('POST /api/conversations', () => {
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

    const res = await POST()(mockRequest('/api/conversations', { method: 'POST', body: { name: 'test' } }));
    const body = await res.json();
    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST()(mockRequest('/api/conversations', { method: 'POST', body: {} }));
    const body = await res.json();
    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});
