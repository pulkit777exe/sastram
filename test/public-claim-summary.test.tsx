import React from 'react';
import { describe, it } from 'mocha';
import { expect } from 'chai';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicClaimSummaryList } from '@/components/thread/public-claim-summary';
import type { PublicClaimSummary } from '@/modules/claims/types';

describe('PublicClaimSummaryList (Phase 3)', () => {
  it('renders read-only claim statuses and counts without vote controls', () => {
    const claims: PublicClaimSummary[] = [
      {
        id: 'c1',
        messageId: 'm1',
        position: 0,
        text: 'A verified claim',
        status: 'CONFIRMED',
        sourceLabel: 'Web',
        sourceUrl: 'https://example.com',
        excerpt: null,
        confidence: 80,
        confirmCount: 3,
        disputeCount: 1,
        net: 2,
      },
    ];
    const html = renderToStaticMarkup(<PublicClaimSummaryList claims={claims} />);
    expect(html).to.contain('Claim verification');
    expect(html).to.contain('A verified claim');
    expect(html).to.contain('Confirmed');
    expect(html).to.contain('Confirm 3');
    expect(html).to.contain('Dispute 1');
    expect(html).to.not.contain('<button');
  });

  it('renders nothing when empty', () => {
    const html = renderToStaticMarkup(<PublicClaimSummaryList claims={[]} />);
    expect(html).to.equal('');
  });
});
