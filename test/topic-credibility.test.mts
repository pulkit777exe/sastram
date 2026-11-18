import { describe, it } from 'mocha';
import { expect } from 'chai';
import { deriveTopicCredibility } from '../modules/tags/repository';

const byStatus = (open: number, confirmed: number, disputed: number, contested: number) => ({
  OPEN: open,
  CONFIRMED: confirmed,
  DISPUTED: disputed,
  CONTESTED: contested,
});

describe('deriveTopicCredibility', () => {
  it('returns insufficient data for sparse topics', () => {
    const res = deriveTopicCredibility({ threadCount: 1, resolvedThreadCount: 0, byStatus: byStatus(1, 0, 0, 0) });
    expect(res.level).to.equal('INSUFFICIENT_DATA');
  });

  it('returns supported when confirmations dominate and disputes are low', () => {
    const res = deriveTopicCredibility({ threadCount: 4, resolvedThreadCount: 2, byStatus: byStatus(1, 5, 0, 1) });
    expect(res.level).to.equal('SUPPORTED');
  });

  it('returns mixed when disputed/contested signals are meaningful', () => {
    const res = deriveTopicCredibility({ threadCount: 4, resolvedThreadCount: 1, byStatus: byStatus(1, 2, 2, 1) });
    expect(res.level).to.equal('MIXED');
  });

  it('returns emerging when some signal exists without strong support/conflict', () => {
    const res = deriveTopicCredibility({ threadCount: 3, resolvedThreadCount: 0, byStatus: byStatus(3, 1, 0, 0) });
    expect(res.level).to.equal('EMERGING');
  });
});
