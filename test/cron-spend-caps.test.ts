import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { AiCallPath } from '@/lib/services/ai-cost-classification';

type GuardModule = typeof import('@/lib/ai/guard');
type SpendCapModule = typeof import('@/lib/services/ai-spend-cap');

const guardModulePath = require.resolve('@/lib/ai/guard');
const spendCapModulePath = require.resolve('@/lib/services/ai-spend-cap');
const quotaModulePath = require.resolve('@/lib/services/daily-quota');
const loggerModulePath = require.resolve('@/lib/infrastructure/logger');
const redisModulePath = require.resolve('@/lib/infrastructure/redis-upstash');

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

describe('checkCronSpendCaps (read-only)', () => {
  afterEach(() => {
    delete require.cache[guardModulePath];
    delete require.cache[spendCapModulePath];
    delete require.cache[quotaModulePath];
    delete require.cache[loggerModulePath];
    delete require.cache[redisModulePath];
  });

  it('reads via checkAiSpendCap and never calls the consuming seam', async () => {
    const readStub = sinon.stub().resolves({ allowed: false, remaining: 0 });
    const enforceStub = sinon.stub().resolves({ allowed: true, remaining: 1 });
    const consumeStub = sinon.stub().resolves({ allowed: true, remaining: 1 });

    stubModule(spendCapModulePath, {
      checkAiSpendCap: readStub,
      enforceAiSpendCap: enforceStub,
      consumeSpendCap: consumeStub,
    });
    stubModule(quotaModulePath, { consumeQuota: sinon.stub() });
    stubModule(loggerModulePath, {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    delete require.cache[guardModulePath];

    const { checkCronSpendCaps } = require(guardModulePath) as GuardModule;
    const caps = await checkCronSpendCaps([AiCallPath.DAILY_DIGEST, AiCallPath.THREAD_DNA]);

    expect(caps[AiCallPath.DAILY_DIGEST]).to.deep.equal({ allowed: false, remaining: 0 });
    expect(caps[AiCallPath.THREAD_DNA]).to.deep.equal({ allowed: false, remaining: 0 });
    sinon.assert.calledWith(readStub, AiCallPath.DAILY_DIGEST);
    sinon.assert.calledWith(readStub, AiCallPath.THREAD_DNA);
    sinon.assert.notCalled(enforceStub);
    sinon.assert.notCalled(consumeStub);
  });

  it('fails open per path when the read throws', async () => {
    const readStub = sinon.stub().rejects(new Error('redis down'));

    stubModule(spendCapModulePath, {
      checkAiSpendCap: readStub,
      enforceAiSpendCap: sinon.stub(),
      consumeSpendCap: sinon.stub(),
    });
    stubModule(quotaModulePath, { consumeQuota: sinon.stub() });
    stubModule(loggerModulePath, {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    delete require.cache[guardModulePath];

    const { checkCronSpendCaps } = require(guardModulePath) as GuardModule;
    const caps = await checkCronSpendCaps([AiCallPath.DAILY_DIGEST]);

    expect(caps[AiCallPath.DAILY_DIGEST]).to.deep.equal({ allowed: true, remaining: -1 });
  });
});

describe('checkAiSpendCap (no consumption)', () => {
  afterEach(() => {
    delete require.cache[spendCapModulePath];
    delete require.cache[loggerModulePath];
    delete require.cache[redisModulePath];
  });

  function loadSpendCap(spend: number | null): { mod: SpendCapModule; getStub: sinon.SinonStub; consumeStub: sinon.SinonStub } {
    const getStub = sinon.stub().resolves(spend);
    const consumeStub = sinon.stub();

    stubModule(loggerModulePath, {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    stubModule(redisModulePath, {
      getUpstashRedis: () => ({ get: getStub, eval: consumeStub }),
      getSecondsUntilUtcMidnight: () => 3600,
      CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA: 'return 1',
      withRedisTimeout: (promise: Promise<unknown>) => promise,
    });
    delete require.cache[spendCapModulePath];

    return { mod: require(spendCapModulePath) as SpendCapModule, getStub, consumeStub };
  }

  it('allows when spend is under the cap and reports remaining without incrementing', async () => {
    const { mod, getStub, consumeStub } = loadSpendCap(1.5);

    const result = await mod.checkAiSpendCap(AiCallPath.DAILY_DIGEST);

    expect(result.allowed).to.equal(true);
    expect(result.remaining).to.be.closeTo(3.5, 1e-9);
    sinon.assert.calledOnce(getStub);
    sinon.assert.notCalled(consumeStub);
  });

  it('denies when spend is at the cap without incrementing (fail-closed over-cap verdict)', async () => {
    const { mod, consumeStub } = loadSpendCap(5);

    const result = await mod.checkAiSpendCap(AiCallPath.DAILY_DIGEST);

    expect(result).to.deep.equal({ allowed: false, remaining: 0 });
    sinon.assert.notCalled(consumeStub);
  });

  it('fails open when Redis is unavailable', async () => {
    stubModule(loggerModulePath, {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    stubModule(redisModulePath, {
      getUpstashRedis: () => null,
      getSecondsUntilUtcMidnight: () => 3600,
      CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA: 'return 1',
      withRedisTimeout: (promise: Promise<unknown>) => promise,
    });
    delete require.cache[spendCapModulePath];

    const { checkAiSpendCap } = require(spendCapModulePath) as SpendCapModule;
    const result = await checkAiSpendCap(AiCallPath.DAILY_DIGEST);

    expect(result).to.deep.equal({ allowed: true, remaining: -1 });
  });

  it('fails closed when Redis is unavailable in production', async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const savedNodeEnv = mutableEnv.NODE_ENV;
    mutableEnv.NODE_ENV = 'production';

    try {
      stubModule(loggerModulePath, {
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
      });
      stubModule(redisModulePath, {
        getUpstashRedis: () => null,
        getSecondsUntilUtcMidnight: () => 3600,
        CHECK_AND_INCRBY_FLOAT_EXPIRE_LUA: 'return 1',
        withRedisTimeout: (promise: Promise<unknown>) => promise,
      });
      delete require.cache[spendCapModulePath];

      const { checkAiSpendCap } = require(spendCapModulePath) as SpendCapModule;
      const result = await checkAiSpendCap(AiCallPath.DAILY_DIGEST);

      expect(result).to.deep.equal({ allowed: false, remaining: 0 });
    } finally {
      if (savedNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = savedNodeEnv;
    }
  });

  it('cheap paths are always allowed without touching Redis', async () => {
    const { mod, getStub } = loadSpendCap(5);

    const result = await mod.checkAiSpendCap(AiCallPath.THREAD_DNA);

    expect(result).to.deep.equal({ allowed: true, remaining: -1 });
    sinon.assert.notCalled(getStub);
  });
});
