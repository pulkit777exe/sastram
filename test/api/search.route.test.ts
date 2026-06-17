import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from './helpers';
import { prisma } from '@/lib/infrastructure/prisma';

const GET = () => require('@/app/api/search/route').GET;

describe('GET /api/search', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
    stubs.push(sinon.stub(prisma.threadMember, 'findMany').resolves([]));
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
    stubs.push(sinon.stub(prisma.threadMember, 'findMany').resolves([]));

    const res = await GET()(mockRequest('/api/search?q=test'));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 400 when q param is missing', async () => {
    const res = await GET()(mockRequest('/api/search'));
    const body = await res.json();

    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });

  it('returns 400 when q param is empty', async () => {
    const res = await GET()(mockRequest('/api/search?q='));
    const body = await res.json();

    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });

  it('returns 400 when q exceeds 200 characters', async () => {
    const res = await GET()(mockRequest('/api/search?q=' + 'a'.repeat(201)));
    const body = await res.json();

    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });

  it('returns 400 when type is invalid', async () => {
    const res = await GET()(mockRequest('/api/search?q=test&type=invalid'));
    const body = await res.json();

    expect(res.status).to.equal(400);
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
  });
});
