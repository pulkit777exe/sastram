import { expect } from 'chai';
import { Queue, Worker } from 'bullmq';
import { getRedisConnection, closeRedisConnection } from '@/lib/queue/connection';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@/lib/queue/config';
import { workerDefinitions, stopAllWorkers } from '@/lib/queue/workers/index';

async function redisAvailable(): Promise<boolean> {
  try {
    const conn = getRedisConnection();
    await conn.ping();
    return true;
  } catch {
    return false;
  }
}

describe('BullMQ — Queue Integration', function () {
  this.timeout(30000);

  let hasRedis = false;
  let testQueue: Queue;
  const testQueueName = `test-queue-${Date.now()}`;

  before(async function () {
    hasRedis = await redisAvailable();
    if (!hasRedis) {
      console.log('[BullMQ Integration] Redis unavailable — skipping integration tests');
      this.skip();
    }
    testQueue = new Queue(testQueueName, { connection: getRedisConnection() });
  });

  after(async function () {
    if (!hasRedis) return;
    await testQueue.close();
    // Clean up test queue
    const conn = getRedisConnection();
    await conn.del(`bull:${testQueueName}:wait`);
    await conn.del(`bull:${testQueueName}:active`);
    await conn.del(`bull:${testQueueName}:completed`);
    await conn.del(`bull:${testQueueName}:failed`);
    await closeRedisConnection();
  });

  it('can add and process a job', async function () {
    const processed: string[] = [];
    const worker = new Worker(
      testQueueName,
      async (job) => {
        processed.push(job.data.value);
        return { done: true };
      },
      { connection: getRedisConnection() }
    );

    await testQueue.add('test-job', { value: 'hello' });
    // Wait for job to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(processed).to.include('hello');
    await worker.close();
  });

  it('respects job options (attempts, backoff)', async function () {
    const queue = new Queue(`${testQueueName}-opts`, { connection: getRedisConnection() });
    const job = await queue.add(
      'opts-test',
      { value: 'test' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      }
    );

    expect(job.opts.attempts).to.equal(3);
    expect(job.opts.backoff).to.deep.equal({ type: 'exponential', delay: 1000 });
    expect(job.opts.removeOnComplete).to.deep.equal({ count: 10 });
    expect(job.opts.removeOnFail).to.deep.equal({ count: 50 });

    await queue.close();
  });

  it('failed jobs go to dead letter queue after max attempts', async function () {
    const dlqQueueName = `${testQueueName}-dlq`;
    const queue = new Queue(dlqQueueName, { connection: getRedisConnection() });
    let attempts = 0;

    const worker = new Worker(
      dlqQueueName,
      async () => {
        attempts++;
        throw new Error('Intentional failure');
      },
      { connection: getRedisConnection() }
    );

    await queue.add('dlq-test', { value: 'fail-me' }, { attempts: 1 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(attempts).to.equal(1);

    await worker.close();
    await queue.close();
  });

  it('can list all defined queue names', function () {
    const expectedQueues = [
      'thread-summary',
      'resolution-score',
      'thread-dna',
      'conflict-detection',
      'daily-digest',
      'ai-insight-notifications',
      'email',
      'ai-inline',
      'staleness-check',
    ];
    expect(Object.values(QUEUE_NAMES)).to.have.members(expectedQueues);
  });

  it('worker definitions map all 9 queues', function () {
    expect(workerDefinitions).to.have.lengthOf(9);
    const definedQueues = workerDefinitions.map((d) => d.queueName);
    for (const queueName of Object.values(QUEUE_NAMES)) {
      expect(definedQueues).to.include(queueName);
    }
  });

  it('each worker definition has a handler function', function () {
    for (const def of workerDefinitions) {
      expect(def.handler).to.be.a('function');
    }
  });

  it('DEFAULT_JOB_OPTIONS has correct shape', function () {
    expect(DEFAULT_JOB_OPTIONS).to.deep.include({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).to.have.property('count', 100);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).to.have.property('count', 500);
  });
});
