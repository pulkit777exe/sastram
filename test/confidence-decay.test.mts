import { describe, it } from 'mocha';
import { expect } from 'chai';
import { computeConfidence, hasTrustedProvenance } from '@/modules/threads/confidence-decay';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describe('confidence decay', () => {
  it('is fully confident inside the 30-day recency window', () => {
    expect(computeConfidence(daysAgo(0)).confidence).to.equal(1);
    expect(computeConfidence(daysAgo(29)).confidence).to.equal(1);
    expect(computeConfidence(daysAgo(30)).confidence).to.equal(1);
  });

  it('crosses 0.5 at ~120 days and halves every 90 days after that', () => {
    expect(computeConfidence(daysAgo(120)).confidence).to.be.closeTo(0.5, 0.01);
    expect(computeConfidence(daysAgo(210)).confidence).to.be.closeTo(0.25, 0.01);
  });

  it('never drops below the 0.05 floor', () => {
    expect(computeConfidence(daysAgo(50 * 365)).confidence).to.equal(0.05);
  });

  it('treats future timestamps as age 0', () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    expect(computeConfidence(future).ageDays).to.equal(0);
    expect(computeConfidence(future).confidence).to.equal(1);
  });

  describe('hasTrustedProvenance', () => {
    it('is false when neither provenance exists', () => {
      expect(hasTrustedProvenance(null, null)).to.equal(false);
      expect(hasTrustedProvenance(undefined, undefined)).to.equal(false);
    });

    it('trusts a fresh AI score', () => {
      expect(hasTrustedProvenance(null, daysAgo(10))).to.equal(true);
    });

    it('distrusts an AI score older than the ~120-day window', () => {
      expect(hasTrustedProvenance(null, daysAgo(130))).to.equal(false);
    });

    it('prefers human verification over a stale AI score', () => {
      expect(hasTrustedProvenance(daysAgo(5), daysAgo(400))).to.equal(true);
    });

    it('uses the human-verification age when both stamps exist', () => {
      expect(hasTrustedProvenance(daysAgo(200), daysAgo(1))).to.equal(false);
    });
  });
});
