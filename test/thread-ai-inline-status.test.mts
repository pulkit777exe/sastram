import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  aiInlineStatusReducer,
  AI_PENDING_TIMEOUT_MS,
} from '@/hooks/thread/ai-inline-status';

describe('aiInlineStatusReducer', () => {
  it('exposes the 120s pending timeout', () => {
    expect(AI_PENDING_TIMEOUT_MS).to.equal(120_000);
  });

  it('sets queued/pending/streaming/failed/limited states', () => {
    for (const status of ['queued', 'pending', 'streaming', 'failed', 'limited'] as const) {
      const next = aiInlineStatusReducer({}, { type: 'set', messageId: 'm1', status });
      expect(next['m1']).to.equal(status);
    }
  });

  it('returns the same state when setting the identical status', () => {
    const prev = { m1: 'pending' as const };
    const next = aiInlineStatusReducer(prev, { type: 'set', messageId: 'm1', status: 'pending' });
    expect(next).to.equal(prev);
  });

  it('clears an existing entry and keeps referential equality when missing', () => {
    const prev = { m1: 'pending' as const, m2: 'failed' as const };
    const cleared = aiInlineStatusReducer(prev, { type: 'clear', messageId: 'm1' });
    expect(cleared).to.not.have.property('m1');
    expect(cleared['m2']).to.equal('failed');

    const untouched = aiInlineStatusReducer(prev, { type: 'clear', messageId: 'missing' });
    expect(untouched).to.equal(prev);
  });

  it('TIMEOUT transitions pending -> failed only (guards prev === pending)', () => {
    const pending = aiInlineStatusReducer(
      { m1: 'pending' },
      { type: 'timeout', messageId: 'm1' }
    );
    expect(pending['m1']).to.equal('failed');

    for (const status of ['queued', 'streaming', 'failed', 'limited'] as const) {
      const prev = { m1: status };
      const next = aiInlineStatusReducer(prev, { type: 'timeout', messageId: 'm1' });
      expect(next).to.equal(prev);
      expect(next['m1']).to.equal(status);
    }

    const missing = aiInlineStatusReducer({}, { type: 'timeout', messageId: 'nope' });
    expect(missing).to.deep.equal({});
  });
});
