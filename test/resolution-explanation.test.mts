import { describe, it } from 'mocha';
import { expect } from 'chai';
import { explainResolution, summarizeClaimSignal } from '@/lib/utils/resolution-explanation';

const NOW = new Date('2026-11-15T00:00:00.000Z');

describe('summarizeClaimSignal', () => {
  it('returns null for empty input', () => {
    expect(summarizeClaimSignal(null)).to.equal(null);
    expect(summarizeClaimSignal([])).to.equal(null);
  });

  it('counts statuses', () => {
    const s = summarizeClaimSignal([
      { status: 'OPEN' },
      { status: 'CONFIRMED' },
      { status: 'DISPUTED' },
      { status: 'CONTESTED' },
      { status: 'OPEN' },
    ]);
    expect(s).to.deep.equal({ total: 5, open: 2, confirmed: 1, disputed: 1, contested: 1 });
  });
});

describe('explainResolution', () => {
  it('handles pending score', () => {
    const r = explainResolution({ score: null, now: NOW });
    expect(r.effectiveScore).to.equal(null);
    expect(r.factors.some((f) => f.key === 'pending')).to.equal(true);
  });

  it('explains verified fresh score', () => {
    const r = explainResolution({
      score: 90,
      verifiedAt: '2026-11-10T00:00:00.000Z',
      lastVerifiedAt: '2026-11-10T00:00:00.000Z',
      now: NOW,
    });
    expect(r.isVerified).to.equal(true);
    expect(r.factors.some((f) => f.key === 'verification' && f.tone === 'positive')).to.equal(true);
    expect(r.factors.some((f) => f.key === 'freshness')).to.equal(true);
  });

  it('explains unverified aged score with decay', () => {
    const r = explainResolution({
      score: 80,
      lastVerifiedAt: '2026-05-01T00:00:00.000Z',
      now: NOW,
    });
    expect(r.isVerified).to.equal(false);
    expect(r.isAged).to.equal(true);
    expect(r.factors.some((f) => f.key === 'verification' && f.tone === 'warning')).to.equal(true);
    expect(r.factors.some((f) => f.key === 'decay' && f.tone === 'warning')).to.equal(true);
    expect(r.hints.length > 0).to.equal(true);
  });

  it('flags outdated threads', () => {
    const r = explainResolution({
      score: 70,
      lastVerifiedAt: '2026-11-10T00:00:00.000Z',
      isOutdated: true,
      now: NOW,
    });
    expect(r.factors.some((f) => f.key === 'outdated' && f.tone === 'critical')).to.equal(true);
  });

  it('includes contested/disputed claim signal', () => {
    const r = explainResolution({
      score: 75,
      verifiedAt: '2026-11-10T00:00:00.000Z',
      claimSignal: { total: 4, open: 1, confirmed: 1, disputed: 1, contested: 1 },
      now: NOW,
    });
    expect(r.factors.some((f) => f.key === 'claims' && f.tone === 'critical')).to.equal(true);
  });

  it('includes open claim signal when none contested', () => {
    const r = explainResolution({
      score: 75,
      verifiedAt: '2026-11-10T00:00:00.000Z',
      claimSignal: { total: 3, open: 1, confirmed: 2, disputed: 0, contested: 0 },
      now: NOW,
    });
    expect(r.factors.some((f) => f.key === 'claims' && f.tone === 'neutral')).to.equal(true);
  });

  it('gracefully omits claim factor when signal missing', () => {
    const r = explainResolution({ score: 60, lastVerifiedAt: '2026-11-10T00:00:00.000Z', now: NOW });
    expect(r.factors.some((f) => f.key === 'claims')).to.equal(false);
  });
});
