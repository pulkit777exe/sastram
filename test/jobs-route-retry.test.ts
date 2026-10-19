import { describe, it, afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/utils/errors';

const loggerModulePath = require.resolve('@/lib/infrastructure/logger');
const jobDedupModulePath = require.resolve('@/lib/services/job-dedup');
const registryModulePath = require.resolve('@/lib/queue/registry');
const routeModulePath = require.resolve('@/app/api/jobs/route');

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

function buildJobRequest(messageId: string): NextRequest {
  return new NextRequest(new URL('/api/jobs', 'http://localhost:3000'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'upstash-message-id': messageId,
    },
    body: JSON.stringify({ jobType: 'test-job', payload: {} }),
  });
}

describe('POST /api/jobs retry integrity', () => {
  let dedupStub: sinon.SinonStub;
  let releaseStub: sinon.SinonStub;
  let handlerStub: sinon.SinonStub;
  let savedSigningKey: string | undefined;
  let savedNextSigningKey: string | undefined;
  let savedNodeEnv: string | undefined;

  // Next's ProcessEnv types mark NODE_ENV read-only; this test mutates it on purpose.
  const mutableEnv = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    savedSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    savedNextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    savedNodeEnv = mutableEnv.NODE_ENV;
    // No signing key + non-production → signature verification is skipped.
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    mutableEnv.NODE_ENV = 'test';

    dedupStub = sinon.stub().resolves(true);
    releaseStub = sinon.stub().resolves(true);
    handlerStub = sinon.stub().resolves({ ok: true });

    stubModule(loggerModulePath, {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    stubModule(jobDedupModulePath, {
      deduplicateJob: dedupStub,
      releaseJobDedup: releaseStub,
    });
    stubModule(registryModulePath, {
      jobHandlers: { 'test-job': handlerStub },
    });
    delete require.cache[routeModulePath];
  });

  afterEach(() => {
    if (savedSigningKey === undefined) delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    else process.env.QSTASH_CURRENT_SIGNING_KEY = savedSigningKey;
    if (savedNextSigningKey === undefined) delete process.env.QSTASH_NEXT_SIGNING_KEY;
    else process.env.QSTASH_NEXT_SIGNING_KEY = savedNextSigningKey;
    if (savedNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = savedNodeEnv;

    delete require.cache[loggerModulePath];
    delete require.cache[jobDedupModulePath];
    delete require.cache[registryModulePath];
    delete require.cache[routeModulePath];
  });

  it('releases the dedup claim on a retryable failure so the QStash retry re-executes', async () => {
    handlerStub.rejects(new Error('transient provider failure'));
    const POST = (require(routeModulePath) as typeof import('@/app/api/jobs/route')).POST;

    const res = await POST(buildJobRequest('msg-retryable'));

    expect(res.status).to.equal(500);
    sinon.assert.calledOnceWithExactly(releaseStub, 'msg-retryable');
  });

  it('keeps the claim on AppError — terminal failures are not retried', async () => {
    handlerStub.rejects(new AppError('bad payload', 'VALIDATION_ERROR', 400));
    const POST = (require(routeModulePath) as typeof import('@/app/api/jobs/route')).POST;

    const res = await POST(buildJobRequest('msg-terminal'));

    expect(res.status).to.equal(200);
    sinon.assert.notCalled(releaseStub);
  });

  it('does not run the handler or release the claim on duplicate delivery', async () => {
    dedupStub.resolves(false);
    const POST = (require(routeModulePath) as typeof import('@/app/api/jobs/route')).POST;

    const res = await POST(buildJobRequest('msg-duplicate'));
    const body = await res.json();

    expect(res.status).to.equal(200);
    expect(body).to.deep.equal({ ok: true, duplicate: true });
    sinon.assert.notCalled(handlerStub);
    sinon.assert.notCalled(releaseStub);
  });
});
