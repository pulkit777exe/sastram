import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { AIJobType } from '@/lib/queue/config';

const POST = () => require('@/app/api/ai/thread-summary/route').POST;

const THREAD_ID = 'cklxy00000000000000000000';
const queueModulePath = require.resolve('@/lib/services/queue');

/** Guard seam: real thread access against fake prisma, stubbed quota/spend leg. */
function installGuardDeps(checkGuards: sinon.SinonStub) {
  const guardRoute = require('@/lib/middleware/ai-guard-route');
  const { requireReadOrThrow } = require('@/lib/thread-access');
  guardRoute.setGuardDepsForTests({
    checkGuards,
    checkAccess: (tid: string, sess: { user: { id: string; role: never } }) =>
      requireReadOrThrow(tid, sess.user.id, sess.user.role),
  });
  return guardRoute;
}

function installEnqueueJobStub() {
  const enqueueJob = sinon.stub().resolves({ status: 'published', ok: true });
  require.cache[queueModulePath] = {
    id: queueModulePath,
    filename: queueModulePath,
    loaded: true,
    exports: { enqueueJob },
  } as NodeModule;
  return enqueueJob;
}

describe('POST /api/ai/thread-summary', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    resetRateLimiters();
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    delete require.cache[queueModulePath];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

    const res = await POST()(mockRequest('/api/ai/thread-summary', {
      method: 'POST',
      body: { threadId: 'cklxy00000000000000000000' },
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

  it('returns 404 (not 403) for a missing thread, before quota is consumed', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => null,
    });
    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardRoute = installGuardDeps(checkGuards);

    try {
      const res = await POST()(mockRequest('/api/ai/thread-summary', {
        method: 'POST',
        body: { threadId: THREAD_ID },
      }));
      const body = await res.json();

      expect(res.status).to.equal(404);
      expect(body.error?.code).to.equal('NOT_FOUND');
      sinon.assert.notCalled(checkGuards);
    } finally {
      guardRoute.setGuardDepsForTests(null);
      restorePrisma();
    }
  });

  it('does not consume quota when the <20-message precheck rejects', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({ id: THREAD_ID, createdBy: 'other-user', visibility: 'PUBLIC' }),
      'message.count': async () => 0,
    });
    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardRoute = installGuardDeps(checkGuards);

    try {
      const res = await POST()(mockRequest('/api/ai/thread-summary', {
        method: 'POST',
        body: { threadId: THREAD_ID },
      }));
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      expect(body.error?.message).to.contain('at least 20 messages');
      sinon.assert.notCalled(checkGuards);
    } finally {
      guardRoute.setGuardDepsForTests(null);
      restorePrisma();
    }
  });

  it('stamps alreadyBilled on the enqueued summary job (guard already consumed spend)', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({ id: THREAD_ID, createdBy: 'other-user', visibility: 'PUBLIC' }),
      'message.count': async () => 25,
      'message.findMany': async () => [],
    });
    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardRoute = installGuardDeps(checkGuards);
    const enqueueJob = installEnqueueJobStub();

    try {
      const res = await POST()(mockRequest('/api/ai/thread-summary', {
        method: 'POST',
        body: { threadId: THREAD_ID },
      }));
      const body = await res.json();

      expect(res.status).to.equal(200);
      expect(body.success).to.equal(true);
      sinon.assert.calledOnce(checkGuards);
      sinon.assert.calledOnce(enqueueJob);
      const [jobType, payload] = enqueueJob.firstCall.args;
      expect(jobType).to.equal(AIJobType.GENERATE_THREAD_SUMMARY);
      expect(payload.threadId).to.equal(THREAD_ID);
      expect(payload.userId).to.equal('test-user-id');
      expect(payload.alreadyBilled).to.be.a('string');
      expect(payload.alreadyBilled.length).to.be.greaterThan(0);
    } finally {
      guardRoute.setGuardDepsForTests(null);
      restorePrisma();
    }
  });
});
