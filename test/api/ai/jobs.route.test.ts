import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, restoreStubs } from '../helpers';

const GET = () => require('@/app/api/ai/jobs/route').GET;
const DELETE = () => require('@/app/api/ai/jobs/route').DELETE;

describe('GET /api/ai/jobs', () => {
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

    const res = await GET()(mockRequest('/api/ai/jobs'));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await GET()(mockRequest('/api/ai/jobs'));
    const body = await res.json();

    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});

describe('DELETE /api/ai/jobs', () => {
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

    const res = await DELETE()(mockRequest('/api/ai/jobs', { method: 'DELETE' }));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await DELETE()(mockRequest('/api/ai/jobs', { method: 'DELETE' }));
    const body = await res.json();

    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});
