import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  QUEUE_NAMES,
  AIJobType,
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

  describe('AIJobType', () => {
    it('should have 7 AI job types', () => {
      expect(Object.keys(AIJobType).length).to.equal(7);
    });
  });
});
