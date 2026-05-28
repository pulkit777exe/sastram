import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleAIInlineJob,
  handleStalenessCheckJob,
} from '@/lib/queue/workers/ai.worker';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  AIJobType,
} from '@/lib/queue/config';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function makeMockJob<T>(data: T) {
  return {
    id: 'test-job-123',
    data,
    attemptMade: 0,
    attemptsMade: 0,
    opts: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  } as any;
}

describe('BullMQ Job Handlers', () => {
  describe('Input Validation', () => {
    it('handleThreadSummaryJob should throw when threadId is missing', async () => {
      const job = makeMockJob({ threadId: '', messages: ['hello'] });
      try {
        await handleThreadSummaryJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleThreadSummaryJob should throw when messages is missing', async () => {
      const job = makeMockJob({ threadId: 't1', messages: undefined as any });
      try {
        await handleThreadSummaryJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleThreadDnaJob should throw when threadId is missing', async () => {
      const job = makeMockJob({ threadId: '', messages: ['hello'] });
      try {
        await handleThreadDnaJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleResolutionScoreJob should throw when threadId is missing', async () => {
      const job = makeMockJob({ threadId: '', messages: ['hello'] });
      try {
        await handleResolutionScoreJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleConflictDetectionJob should throw when threadId is missing', async () => {
      const job = makeMockJob({ threadId: '', messages: ['hello'] });
      try {
        await handleConflictDetectionJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleDailyDigestJob should throw when threadSummaries is missing', async () => {
      const job = makeMockJob({ threadSummaries: undefined as any });
      try {
        await handleDailyDigestJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleAIInlineJob should throw when messageId is missing', async () => {
      const job = makeMockJob({ messageId: '', content: 'hello' });
      try {
        await handleAIInlineJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleStalenessCheckJob should throw when both threadId and cronJob are missing', async () => {
      const job = makeMockJob({});
      try {
        await handleStalenessCheckJob(job);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).to.include('Missing required fields');
      }
    });

    it('handleStalenessCheckJob should handle non-existent thread gracefully', async function () {
      if (!(await dbAvailable())) this.skip();
      const job = makeMockJob({ threadId: `non-existent-${Date.now()}` });
      const result = await handleStalenessCheckJob(job);
      expect(result).to.have.property('handled', true);
      expect(result).to.have.property('checked', 1);
      expect(result).to.have.property('updated', 0);
    });

    it('handleStalenessCheckJob should run batch check for cron mode', async function () {
      if (!(await dbAvailable())) this.skip();
      const job = makeMockJob({ cronJob: true });
      const result = await handleStalenessCheckJob(job);
      expect(result).to.have.property('handled', true);
    });
  });

  describe('Job Configuration Consistency', () => {
    it('DEFAULT_JOB_OPTIONS should have retry configuration', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).to.be.a('number');
      expect(DEFAULT_JOB_OPTIONS.attempts).to.be.greaterThan(0);
      expect(DEFAULT_JOB_OPTIONS.backoff).to.have.property('type');
      expect(DEFAULT_JOB_OPTIONS.backoff).to.have.property('delay');
    });

    it('DEFAULT_JOB_OPTIONS should remove completed jobs', () => {
      expect(DEFAULT_JOB_OPTIONS.removeOnComplete).to.have.property('count');
    });

    it('DEFAULT_JOB_OPTIONS should keep failed jobs', () => {
      expect(DEFAULT_JOB_OPTIONS.removeOnFail).to.have.property('count');
    });
  });
});
