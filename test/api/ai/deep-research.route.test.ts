import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { AIJobType } from '@/lib/queue/config';

const POST = () => require('@/app/api/ai/deep-research/route').POST;

const queueModulePath = require.resolve('@/lib/services/queue');

function installGuardDeps(checkGuards: sinon.SinonStub) {
  const guardRoute = require('@/lib/middleware/ai-guard-route');
  guardRoute.setGuardDepsForTests({
    checkGuards,
    checkAccess: async (threadId: string) => ({ threadId, createdBy: null, visibility: 'PUBLIC' }),
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

describe('POST /api/ai/deep-research', () => {
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

    const res = await POST()(mockRequest('/api/ai/deep-research', {
      method: 'POST',
      body: { query: 'valid query' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('rejects an invalid body without consuming quota/spend', async () => {
    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardRoute = installGuardDeps(checkGuards);

    try {
      const res = await POST()(mockRequest('/api/ai/deep-research', {
        method: 'POST',
        body: { query: 'x' },
      }));
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      sinon.assert.notCalled(checkGuards);
    } finally {
      guardRoute.setGuardDepsForTests(null);
    }
  });

  it('bills the DEEP_RESEARCH path and stamps alreadyBilled on the job', async () => {
    const restorePrisma = installFakePrisma({
      'user.findUnique': async () => null,
    });
    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardRoute = installGuardDeps(checkGuards);
    const enqueueJob = installEnqueueJobStub();

    try {
      const res = await POST()(mockRequest('/api/ai/deep-research', {
        method: 'POST',
        body: { query: 'valid research question' },
      }));
      const body = await res.json();

      expect(res.status).to.equal(200);
      expect(body.success).to.equal(true);
      sinon.assert.calledOnce(checkGuards);
      expect(checkGuards.firstCall.args[0]).to.equal(AiCallPath.DEEP_RESEARCH);
      sinon.assert.calledOnce(enqueueJob);
      const [jobType, payload] = enqueueJob.firstCall.args;
      expect(jobType).to.equal(AIJobType.GENERATE_DEEP_RESEARCH);
      expect(payload.query).to.equal('valid research question');
      expect(payload.userId).to.equal('test-user-id');
      expect(payload.alreadyBilled).to.be.a('string');
      expect(payload.alreadyBilled.length).to.be.greaterThan(0);
    } finally {
      guardRoute.setGuardDepsForTests(null);
      restorePrisma();
    }
  });
});
