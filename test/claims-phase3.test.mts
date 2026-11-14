import { describe, it } from 'mocha';
import { expect } from 'chai';
import { computeClaimStatus, buildClaimRowsFromEvidence, toPublicClaimSummary } from '@/modules/claims';
import type { ResearchEvidence, Source } from '@/modules/ai-search/types';

describe('claim verification (Phase 3)', () => {
  describe('computeClaimStatus thresholds', () => {
    it('is OPEN with fewer than 2 votes', () => {
      expect(computeClaimStatus(0, 0)).to.equal('OPEN');
      expect(computeClaimStatus(1, 0)).to.equal('OPEN');
      expect(computeClaimStatus(0, 1)).to.equal('OPEN');
    });

    it('is CONFIRMED when net >= 2 with enough votes', () => {
      expect(computeClaimStatus(2, 0)).to.equal('CONFIRMED');
      expect(computeClaimStatus(3, 1)).to.equal('CONFIRMED');
    });

    it('is DISPUTED when net <= -2 with enough votes', () => {
      expect(computeClaimStatus(0, 2)).to.equal('DISPUTED');
      expect(computeClaimStatus(1, 3)).to.equal('DISPUTED');
    });

    it('is CONTESTED when total >= 2 but |net| < 2', () => {
      expect(computeClaimStatus(1, 1)).to.equal('CONTESTED');
      expect(computeClaimStatus(2, 1)).to.equal('CONTESTED');
      expect(computeClaimStatus(1, 2)).to.equal('CONTESTED');
    });
  });

  describe('buildClaimRowsFromEvidence redaction', () => {
    it('redacts internal Sastram sources (no private url/excerpt)', () => {
      const evidence: ResearchEvidence[] = [
        { id: 'e1', sourceId: 's1', claim: 'Internal claim', excerpt: 'private excerpt', confidence: 90 },
      ];
      const sources: Source[] = [
        {
          id: 's1',
          title: 'Private thread',
          url: '/dashboard/threads/secret',
          domain: 'sastram.app',
          snippet: 'secret snippet',
          text: 'secret text',
          tier: 1,
          confidence: 90,
          isOutdated: false,
          provider: 'sastram',
          sourceLabel: 'Sastram thread',
          contentFetched: true,
        },
      ];
      const rows = buildClaimRowsFromEvidence(evidence, sources);
      expect(rows).to.have.length(1);
      expect(rows[0].text).to.equal('Internal claim');
      expect(rows[0].sourceId).to.equal('s1');
      expect(rows[0].sourceLabel).to.equal('Sastram discussion');
      expect(rows[0].sourceUrl).to.equal(null);
      expect(rows[0].excerpt).to.equal(null);
      expect(rows[0].status).to.equal('OPEN');
    });

    it('keeps safe fields for external sources', () => {
      const evidence: ResearchEvidence[] = [
        { id: 'e2', sourceId: 'w1', claim: 'External claim', excerpt: 'safe excerpt' },
      ];
      const sources: Source[] = [
        {
          id: 'w1',
          title: 'Example',
          url: 'https://example.com/article',
          domain: 'example.com',
          snippet: 'snippet',
          text: 'body',
          tier: 2,
          confidence: 80,
          isOutdated: false,
          provider: 'exa',
          sourceLabel: 'Web',
          contentFetched: true,
        },
      ];
      const rows = buildClaimRowsFromEvidence(evidence, sources);
      expect(rows[0].sourceUrl).to.equal('https://example.com/article');
      expect(rows[0].sourceLabel).to.equal('Web');
      expect(rows[0].excerpt).to.equal('safe excerpt');
    });

    it('skips empty claims and preserves order', () => {
      const rows = buildClaimRowsFromEvidence(
        [
          { id: '1', sourceId: 'x', claim: '' },
          { id: '2', sourceId: 'x', claim: '  ' },
          { id: '3', sourceId: 'x', claim: 'Kept' },
        ],
        []
      );
      expect(rows).to.have.length(1);
      expect(rows[0].position).to.equal(2);
      expect(rows[0].text).to.equal('Kept');
    });
  });

  describe('public claim summary', () => {
    it('maps safe fields and net count', () => {
      const summary = toPublicClaimSummary({
        id: 'c1',
        messageId: 'm1',
        position: 0,
        text: 'Claim',
        status: 'CONFIRMED',
        sourceLabel: 'Web',
        sourceUrl: 'https://example.com',
        excerpt: null,
        confidence: 70,
        confirmCount: 3,
        disputeCount: 1,
      });
      expect(summary.net).to.equal(2);
      expect(summary.status).to.equal('CONFIRMED');
      expect(summary.sourceUrl).to.equal('https://example.com');
    });
  });
});
