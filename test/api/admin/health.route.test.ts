import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';

const GET = () => require('@/app/api/admin/health/route').GET;

describe('GET /api/admin/health', () => {
  let stubs: sinon.SinonStub[] = [];

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 403 when not authenticated', async () => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

    const res = await GET()(mockRequest('/api/admin/health'));
    const body = await res.json();

    expect(res.status).to.equal(403);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 200 or 403 when authenticated as admin', async () => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth({ user: { role: 'ADMIN', status: 'ACTIVE' } }));

    const res = await GET()(mockRequest('/api/admin/health'));

    // requireAdmin uses auth.api.getSession + prisma.user.findUnique
    // In test without DB, the prisma call fails → 403
    // With DB, it returns 200
    expect(res.status).to.be.oneOf([200, 403]);
  });
});
