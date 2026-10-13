import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { prisma } from '@/lib/infrastructure/prisma';
import { resetRateLimiters } from '@/lib/services/rate-limit';

const quotaModulePath = require.resolve('@/lib/services/daily-quota');
const spendCapModulePath = require.resolve('@/lib/services/ai-spend-cap');
const POST = () => require('@/app/api/ai/thread-dna/route').POST;

describe('POST /api/ai/thread-dna', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    resetRateLimiters();
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());

    require.cache[quotaModulePath] = {
      id: quotaModulePath, filename: quotaModulePath, loaded: true, exports: {
        consumeQuota: async () => ({ allowed: true, remaining: 29 }),
      },
    } as NodeModule;
    require.cache[spendCapModulePath] = {
      id: spendCapModulePath, filename: spendCapModulePath, loaded: true, exports: {
        enforceAiSpendCap: async () => ({ allowed: true, remaining: -1 }),
      },
    } as NodeModule;
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    delete require.cache[quotaModulePath];
    delete require.cache[spendCapModulePath];
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
    // Prisma 7 delegates ignore sinon.stub: use save/assign/restore.
    // PRIVATE thread owned by someone else, no invitation, user has email.
    let threadReads = 0;
    const origThreadFindUnique = prisma.thread.findUnique;
    const origInvitationFindFirst = prisma.threadInvitation.findFirst;
    const origUserFindUnique = prisma.user.findUnique;
    (prisma.thread as unknown as Record<string, unknown>).findUnique = (async () => {
      threadReads += 1;
      return {
        id: 'cklxy00000000000000000000',
        createdBy: 'other-user',
        visibility: 'PRIVATE',
      };
    }) as unknown as typeof prisma.thread.findUnique;
    (prisma.threadInvitation as unknown as Record<string, unknown>).findFirst = (async () => null) as typeof prisma.threadInvitation.findFirst;
    (prisma.user as unknown as Record<string, unknown>).findUnique = (async () => ({
      email: 'test@example.com',
    })) as unknown as typeof prisma.user.findUnique;

    try {
      const res = await POST()(mockRequest('/api/ai/thread-dna', {
        method: 'POST',
        body: { threadId: 'cklxy00000000000000000000' },
      }));
      const body = await res.json();

      expect(res.status).to.equal(403);
      expect(body.error?.code).to.equal('FORBIDDEN');
      // Proves the fake intercepted (not the guard catch-all on a DB throw).
      expect(threadReads).to.be.greaterThan(0);
    } finally {
      (prisma.thread as unknown as Record<string, unknown>).findUnique = origThreadFindUnique;
      (prisma.threadInvitation as unknown as Record<string, unknown>).findFirst = origInvitationFindFirst;
      (prisma.user as unknown as Record<string, unknown>).findUnique = origUserFindUnique;
    }
  });
});
