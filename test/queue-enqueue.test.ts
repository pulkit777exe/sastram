import { describe, it, afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

type QueueModule = typeof import('@/lib/services/queue');

const envModulePath = require.resolve('@/lib/config/env');
const loggerModulePath = require.resolve('@/lib/infrastructure/logger');
const redisModulePath = require.resolve('@/lib/infrastructure/redis-upstash');
const qstashModulePath = require.resolve('@upstash/qstash');
const queueModulePath = require.resolve('@/lib/services/queue');

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

describe('lib/services/queue enqueue result', () => {
  let publishStub: sinon.SinonStub;

  beforeEach(() => {
    publishStub = sinon.stub().resolves({ messageId: 'msg-1' });
  });

  afterEach(() => {
    delete require.cache[envModulePath];
    delete require.cache[loggerModulePath];
    delete require.cache[redisModulePath];
    delete require.cache[qstashModulePath];
    delete require.cache[queueModulePath];
  });

  function loadQueue(dailyCount: number): QueueModule {
    stubModule(envModulePath, {
      env: {
        QSTASH_DEV: false,
        QSTASH_TOKEN: 'test-token',
        QSTASH_URL: 'https://qstash.example.com',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      },
    });
    stubModule(loggerModulePath, {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    stubModule(redisModulePath, {
      getUpstashRedis: () => ({ eval: async () => dailyCount }),
      ATOMIC_INCR_EXPIRE_LUA: 'return 1',
      getSecondsUntilUtcMidnight: () => 3600,
      withRedisTimeout: (promise: Promise<unknown>) => promise,
    });
    stubModule(qstashModulePath, {
      Client: class {
        publishJSON(...args: unknown[]) {
          return publishStub(...args);
        }
      },
    });
    delete require.cache[queueModulePath];
    return require(queueModulePath) as QueueModule;
  }

  it('returns published and calls QStash for a non-critical job under the cap', async () => {
    const { enqueueJob } = loadQueue(10);

    const result = await enqueueJob('generate-thread-dna', { threadId: 'thread-1' });

    expect(result).to.deep.equal({ status: 'published', ok: true });
    sinon.assert.calledOnce(publishStub);
    const publishArgs = publishStub.firstCall.args[0] as { url: string; retries: number };
    expect(publishArgs.url).to.equal('http://localhost:3000/api/jobs');
    expect(publishArgs.retries).to.equal(1);
  });

  it('returns dropped and does not publish a non-critical job over the cap', async () => {
    const { enqueueJob } = loadQueue(451);

    const result = await enqueueJob('generate-thread-dna', { threadId: 'thread-1' });

    expect(result).to.deep.equal({ status: 'dropped', ok: false });
    sinon.assert.notCalled(publishStub);
  });

  it('never drops email jobs at the cap — publishes instead (counted but exempt)', async () => {
    const { enqueueJob } = loadQueue(500);

    const result = await enqueueJob('email', { to: 'user@example.com', subject: 'Your code', text: '123456' });

    expect(result).to.deep.equal({ status: 'published', ok: true });
    sinon.assert.calledOnce(publishStub);
  });
});
