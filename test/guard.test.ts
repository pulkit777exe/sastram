import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { AiCallPath } from '@/lib/services/ai-cost-classification';

type GuardModule = typeof import('@/lib/ai/guard');
type SharedModule = typeof import('@/lib/queue/workers/_shared');

const quotaModulePath = require.resolve('@/lib/services/daily-quota');
const spendCapModulePath = require.resolve('@/lib/services/ai-spend-cap');
const guardModulePath = require.resolve('@/lib/ai/guard');
const sharedModulePath = require.resolve('@/lib/queue/workers/_shared');

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path, filename: path, loaded: true, exports,
  } as NodeModule;
}

function loadGuard(quotaImpl: unknown, spendImpl: unknown): GuardModule {
  delete require.cache[guardModulePath];
  stubModule(quotaModulePath, { consumeQuota: quotaImpl });
  stubModule(spendCapModulePath, { enforceAiSpendCap: spendImpl });
  return require(guardModulePath) as GuardModule;
}

function loadShared(spendImpl: unknown): SharedModule {
  delete require.cache[sharedModulePath];
  delete require.cache[guardModulePath];
  stubModule(spendCapModulePath, {
    enforceAiSpendCap: spendImpl,
    consumeSpendCap: async () => ({ allowed: true, remaining: -1 }),
  });
  return require(sharedModulePath) as SharedModule;
}

const allowQuota = async () => ({ allowed: true, remaining: 5 });
const allowSpend = async () => ({ allowed: true, remaining: 1 });

describe('lib/ai/guard + runGuardedWorker', () => {
  afterEach(() => {
    delete require.cache[quotaModulePath];
    delete require.cache[spendCapModulePath];
    delete require.cache[guardModulePath];
    delete require.cache[sharedModulePath];
  });

  it('quota-deny maps to 429 without consuming spend', async () => {
    const spendStub = sinon.stub().resolves({ allowed: true, remaining: 1 });
    const { checkAiGuards } = loadGuard(async () => ({ allowed: false, remaining: 0 }), spendStub);

    const result = await checkAiGuards(AiCallPath.AI_REPLY_STREAM, 'user-1', { quota: { kind: 'analysis' } });

    expect(result.ok).to.equal(false);
    if (result.ok !== false) expect.fail('expected guard denial');
    expect(result.rejection.code).to.equal('RATE_LIMITED');
    expect(result.rejection.status).to.equal(429);
    sinon.assert.notCalled(spendStub);
  });

  it('spend-deny maps to 503', async () => {
    const { checkAiGuards } = loadGuard(allowQuota, async () => ({ allowed: false, remaining: 0 }));

    const result = await checkAiGuards(AiCallPath.THREAD_SUMMARY, 'user-1', { quota: { kind: 'analysis' } });

    expect(result.ok).to.equal(false);
    if (result.ok !== false) expect.fail('expected guard denial');
    expect(result.rejection.code).to.equal('SERVICE_UNAVAILABLE');
    expect(result.rejection.status).to.equal(503);
  });

  it('checks guards in quota → spend → gate order', async () => {
    const quotaStub = sinon.stub().resolves({ allowed: true, remaining: 5 });
    const spendStub = sinon.stub().resolves({ allowed: true, remaining: 1 });
    const { checkAiGuards } = loadGuard(quotaStub, spendStub);

    const result = await checkAiGuards(AiCallPath.AI_REPLY_STREAM, 'user-1', { quota: { kind: 'analysis' } });

    expect(result.ok).to.equal(true);
    sinon.assert.callOrder(quotaStub, spendStub);
  });

  it('runGuardedAi maps provider quota errors to 429', async () => {
    const { runGuardedAi } = loadGuard(allowQuota, allowSpend);

    const result = await runGuardedAi(AiCallPath.AI_REPLY_STREAM, 'user-1', async () => {
      throw new Error('429 quota exceeded');
    });

    expect(result.ok).to.equal(false);
    if (result.ok !== false) expect.fail('expected guarded rejection');
    expect(result.rejection.code).to.equal('RATE_LIMITED');
    expect(result.rejection.status).to.equal(429);
  });

  it('runGuardedWorker skips spend consumption when alreadyBilled is set', async () => {
    const spendStub = sinon.stub().resolves({ allowed: false, remaining: 0 });
    const { runGuardedWorker } = loadShared(spendStub);
    const task = sinon.stub().resolves('done');

    const result = await runGuardedWorker('thread-summary', AiCallPath.THREAD_SUMMARY, 'thread-1', task, {
      alreadyBilled: 'req-123',
    });

    expect(result).to.deep.equal({ ok: true, value: 'done' });
    sinon.assert.notCalled(spendStub);
    sinon.assert.calledOnce(task);
  });

  it('runGuardedWorker skips without running the task on spend denial', async () => {
    const spendStub = sinon.stub().resolves({ allowed: false, remaining: 0 });
    const { runGuardedWorker } = loadShared(spendStub);
    const task = sinon.stub().resolves('done');

    const result = await runGuardedWorker('thread-summary', AiCallPath.THREAD_SUMMARY, 'thread-1', task);

    expect(result).to.deep.equal({ ok: false, skipped: true });
    sinon.assert.notCalled(task);
  });
});
