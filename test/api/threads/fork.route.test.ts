import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { installFakePrisma } from '@/test/support/fake-prisma';

const POST = () => require('@/app/api/threads/[threadId]/fork/route').POST;

const THREAD_ID = 'cklxy00000000000000000000';

function buildRequest() {
  return mockRequest(`/api/threads/${THREAD_ID}/fork`, {
    method: 'POST',
    body: { title: 'Forked thread' },
  });
}

function buildContext() {
  return { params: Promise.resolve({ threadId: THREAD_ID }) };
}

describe('POST /api/threads/[threadId]/fork', () => {
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

  it('returns 404 (not 403) when the source thread is missing', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => null,
    });

    try {
      const res = await POST()(buildRequest(), buildContext());
      const body = await res.json();

      expect(res.status).to.equal(404);
      expect(body.error?.code).to.equal('NOT_FOUND');
    } finally {
      restorePrisma();
    }
  });

  it('returns 403 when the thread is private and the user has no access', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({ id: THREAD_ID, createdBy: 'other-user', visibility: 'PRIVATE' }),
      'threadInvitation.findFirst': async () => null,
      'user.findUnique': async () => ({ email: 'test@example.com' }),
    });

    try {
      const res = await POST()(buildRequest(), buildContext());
      const body = await res.json();

      expect(res.status).to.equal(403);
      expect(body.error?.code).to.equal('FORBIDDEN');
    } finally {
      restorePrisma();
    }
  });
});
