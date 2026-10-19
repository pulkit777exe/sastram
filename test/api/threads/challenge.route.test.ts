import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { AIJobType } from '@/lib/queue/config';

const POST = () => require('@/app/api/threads/[threadId]/challenge/route').POST;

const THREAD_ID = 'cklxy00000000000000000000';
const queueModulePath = require.resolve('@/lib/services/queue');

function buildRequest() {
  return mockRequest(`/api/threads/${THREAD_ID}/challenge`, {
    method: 'POST',
    body: { counterSourceUrl: 'https://example.com/source' },
  });
}

function buildContext() {
  return { params: Promise.resolve({ threadId: THREAD_ID }) };
}

/** Guard seam: real thread access against fake prisma, stubbed quota/spend leg. */
function installGuardDeps(checkGuards: sinon.SinonStub, useRealAccess = true) {
  const guardRoute = require('@/lib/middleware/ai-guard-route');
  if (!useRealAccess) {
    guardRoute.setGuardDepsForTests({
      checkGuards,
      checkAccess: async (threadId: string) => ({ threadId, createdBy: null, visibility: 'PUBLIC' }),
    });
    return guardRoute;
  }
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

describe('POST /api/threads/[threadId]/challenge', () => {
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

  it('returns 429 from the guard without enqueuing any job', async () => {
    const checkGuards = sinon.stub().resolves({
      ok: false,
      rejection: { code: 'RATE_LIMITED', message: 'Daily AI limit reached.', status: 429 },
    });
    const guardRoute = installGuardDeps(checkGuards, false);
    const enqueueJob = installEnqueueJobStub();

    try {
      const res = await POST()(buildRequest(), buildContext());
      const body = await res.json();

      expect(res.status).to.equal(429);
      expect(body.error?.code).to.equal('RATE_LIMITED');
      sinon.assert.notCalled(enqueueJob);
    } finally {
      guardRoute.setGuardDepsForTests(null);
    }
  });

  it('bills CONFLICT_DETECTION and stamps alreadyBilled only on that job', async () => {
    const restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({
        id: THREAD_ID,
        createdBy: 'other-user',
        visibility: 'PUBLIC',
        name: 'Test thread',
        resolutionScore: 50,
        isOutdated: false,
      }),
      'user.findUnique': async () => null,
      'message.findMany': async () => [],
      'threadSubscription.findMany': async () => [{ userId: 'subscriber-1' }],
    });
    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardRoute = installGuardDeps(checkGuards);
    const enqueueJob = installEnqueueJobStub();

    try {
      const res = await POST()(buildRequest(), buildContext());
      const body = await res.json();

      expect(res.status).to.equal(200);
      expect(body.data).to.deep.equal({ queued: true, jobs: 2 });
      sinon.assert.calledOnce(checkGuards);
      expect(checkGuards.firstCall.args[0]).to.equal(AiCallPath.CONFLICT_DETECTION);

      sinon.assert.calledTwice(enqueueJob);
      const [conflictJobType, conflictPayload] = enqueueJob.firstCall.args;
      expect(conflictJobType).to.equal(AIJobType.DETECT_CONFLICTS);
      expect(conflictPayload.alreadyBilled).to.be.a('string');
      expect(conflictPayload.alreadyBilled.length).to.be.greaterThan(0);

      const [scoreJobType, scorePayload] = enqueueJob.secondCall.args;
      expect(scoreJobType).to.equal(AIJobType.CALCULATE_RESOLUTION_SCORE);
      expect(scorePayload.alreadyBilled).to.equal(undefined);
    } finally {
      guardRoute.setGuardDepsForTests(null);
      restorePrisma();
    }
  });
});
