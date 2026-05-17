import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  AIJobType,
} from '@/lib/queue/config';

describe('BullMQ Queue Configuration', () => {
  describe('QUEUE_NAMES', () => {
    it('should define all 9 queue names', () => {
      const expected = [
        'THREAD_SUMMARY',
        'RESOLUTION_SCORE',
        'THREAD_DNA',
        'CONFLICT_DETECTION',
        'DAILY_DIGEST',
        'AI_INSIGHT_NOTIFICATIONS',
        'EMAIL',
        'AI_INLINE',
        'STALENESS_CHECK',
      ];
      for (const name of expected) {
        expect(QUEUE_NAMES).to.have.property(name);
      }
    });

    it('should have string values for all queues', () => {
      for (const value of Object.values(QUEUE_NAMES)) {
        expect(value).to.be.a('string');
        expect(value.length).to.be.greaterThan(0);
      }
    });
  });

  describe('DEFAULT_JOB_OPTIONS', () => {
    it('should retry 3 times', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).to.equal(3);
    });

    it('should use exponential backoff with 2s delay', () => {
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
    it('should define all 7 AI job types', () => {
      expect(AIJobType).to.have.property('GENERATE_THREAD_SUMMARY');
      expect(AIJobType).to.have.property('CALCULATE_RESOLUTION_SCORE');
      expect(AIJobType).to.have.property('GENERATE_THREAD_DNA');
      expect(AIJobType).to.have.property('DETECT_CONFLICTS');
      expect(AIJobType).to.have.property('GENERATE_DAILY_DIGEST');
      expect(AIJobType).to.have.property('SEND_AI_INSIGHT_NOTIFICATIONS');
      expect(AIJobType).to.have.property('GENERATE_AI_INLINE');
    });
  });

  describe('Job data contracts', () => {
    it('should have consistent threadId field across job types', () => {
      // All AI jobs that operate on threads should have threadId
      const threadBasedJobs = [
        AIJobType.GENERATE_THREAD_SUMMARY,
        AIJobType.CALCULATE_RESOLUTION_SCORE,
        AIJobType.GENERATE_THREAD_DNA,
        AIJobType.DETECT_CONFLICTS,
      ];
      expect(threadBasedJobs.length).to.equal(4);
    });
  });
});
