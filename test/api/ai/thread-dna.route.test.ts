import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { installFakePrisma } from '@/test/support/fake-prisma';

const POST = () => require('@/app/api/ai/thread-dna/route').POST;

describe('POST /api/ai/thread-dna', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    resetRateLimiters();
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

    const res = await POST()(mockRequest('/api/ai/thread-dna', {
      method: 'POST',
      body: { threadId: 'cklxy00000000000000000000' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 403 when not a member', async () => {
    // PRIVATE thread owned by someone else, no invitation, user has email.
    // Guards bypassed via the GuardDeps seam; access runs for real against
    // the fake prisma store (no require.cache module surgery).
    let threadReads = 0;
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => {
        threadReads += 1;
        return { id: 'cklxy00000000000000000000', createdBy: 'other-user', visibility: 'PRIVATE' };
      },
      'threadInvitation.findFirst': async () => null,
      'user.findUnique': async () => ({ email: 'test@example.com' }),
    });
    const guardRoute = require('@/lib/middleware/ai-guard-route');
    const { requireReadOrThrow } = require('@/lib/thread-access');
    guardRoute.setGuardDepsForTests({
      checkGuards: async () => ({ ok: true }),
      checkAccess: (tid: string, sess: { user: { id: string; role: never } }) =>
        requireReadOrThrow(tid, sess.user.id, sess.user.role),
    });

    try {
      const res = await POST()(mockRequest('/api/ai/thread-dna', {
        method: 'POST',
        body: { threadId: 'cklxy00000000000000000000' },
      }));
      const body = await res.json();

      expect(res.status).to.equal(403);
      expect(body.error?.code).to.equal('FORBIDDEN');
      // Proves the fake store intercepted (not a failure-path coincidence).
      expect(threadReads).to.be.greaterThan(0);
    } finally {
      guardRoute.setGuardDepsForTests(null);
      restorePrisma();
    }
  });
});
