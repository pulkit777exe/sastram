import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';

const GET = () => require('@/app/api/ai/jobs/route').GET;
const DELETE = () => require('@/app/api/ai/jobs/route').DELETE;

describe('GET /api/ai/jobs', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 501 - job status tracking not available with QStash', async () => {
    const res = await GET()(mockRequest('/api/ai/jobs'));
    const body = await res.json();

    expect(res.status).to.equal(501);
    expect(body.error?.code).to.equal('NOT_IMPLEMENTED');
  });
});

describe('DELETE /api/ai/jobs', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 501 - job cancellation not available with QStash', async () => {
    const res = await DELETE()(mockRequest('/api/ai/jobs', { method: 'DELETE' }));
    const body = await res.json();

    expect(res.status).to.equal(501);
    expect(body.error?.code).to.equal('NOT_IMPLEMENTED');
  });
});
