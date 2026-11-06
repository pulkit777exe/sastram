import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from './helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { installFakePrisma } from '@/test/support/fake-prisma';

const POST = () => require('@/app/api/bounties/claim/route').POST;

const THREAD_ID = 'cklxy00000000000000000000';

function buildRequest() {
  return mockRequest('/api/bounties/claim', {
    method: 'POST',
    body: { threadId: THREAD_ID },
  });
}

describe('POST /api/bounties/claim', () => {
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

  it('returns 404 when the thread is missing', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => null,
    });

    try {
      const res = await POST()(buildRequest());
      const body = await res.json();

      expect(res.status).to.equal(404);
      expect(body.error?.code).to.equal('NOT_FOUND');
    } finally {
      restorePrisma();
    }
  });

  it('returns 403 when the caller is not the thread creator', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({
        id: THREAD_ID,
        createdBy: 'other-user',
        visibility: 'PUBLIC',
      }),
    });

    try {
      const res = await POST()(buildRequest());
      const body = await res.json();

      expect(res.status).to.equal(403);
      expect(body.error?.code).to.equal('FORBIDDEN');
    } finally {
      restorePrisma();
    }
  });

  it('settles bounties for the thread creator', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({
        id: THREAD_ID,
        createdBy: 'test-user-id',
        visibility: 'PUBLIC',
      }),
      'bounty.updateManyAndReturn': async () => [{ amount: 10 }, { amount: 5 }],
    });

    try {
      const res = await POST()(buildRequest());
      const body = await res.json();

      expect(res.status).to.equal(200);
      expect(body.data).to.deep.equal({ count: 2, amount: 15 });
    } finally {
      restorePrisma();
    }
  });
});
