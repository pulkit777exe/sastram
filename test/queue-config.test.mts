import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  AIJobType,
  FAILED_QUEUE_NAME,
} from '@/lib/queue/config';

describe('Queue Config', () => {
  describe('QUEUE_NAMES', () => {
    it('should have all expected queue names', () => {
      expect(QUEUE_NAMES.THREAD_SUMMARY).to.equal('thread-summary');
      expect(QUEUE_NAMES.RESOLUTION_SCORE).to.equal('resolution-score');
      expect(QUEUE_NAMES.THREAD_DNA).to.equal('thread-dna');
      expect(QUEUE_NAMES.CONFLICT_DETECTION).to.equal('conflict-detection');
      expect(QUEUE_NAMES.DAILY_DIGEST).to.equal('daily-digest');
      expect(QUEUE_NAMES.AI_INSIGHT_NOTIFICATIONS).to.equal('ai-insight-notifications');
      expect(QUEUE_NAMES.EMAIL).to.equal('email');
      expect(QUEUE_NAMES.AI_INLINE).to.equal('ai-inline');
      expect(QUEUE_NAMES.STALENESS_CHECK).to.equal('staleness-check');
    });

    it('should have 9 defined queues', () => {
      expect(Object.keys(QUEUE_NAMES).length).to.equal(9);
    });
  });

  describe('DEFAULT_JOB_OPTIONS', () => {
    it('should have 3 retry attempts', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).to.equal(3);
    });

    it('should have exponential backoff with 2s delay', () => {
      expect(DEFAULT_JOB_OPTIONS.backoff).to.deep.equal({
        type: 'exponential',
        delay: 2000,
      });
    });

    it('should remove completed jobs after 100', () => {
      expect(DEFAULT_JOB_OPTIONS.removeOnComplete).to.deep.equal({ count: 100 });
    });

    it('should keep 500 failed jobs', () => {
      expect(DEFAULT_JOB_OPTIONS.removeOnFail).to.deep.equal({ count: 500 });
    });
  });

  describe('AIJobType', () => {
    it('should have 7 AI job types', () => {
      expect(Object.keys(AIJobType).length).to.equal(7);
    });
  });

  describe('FAILED_QUEUE_NAME', () => {
    it('should be failed-jobs', () => {
      expect(FAILED_QUEUE_NAME).to.equal('failed-jobs');
    });
  });
});
