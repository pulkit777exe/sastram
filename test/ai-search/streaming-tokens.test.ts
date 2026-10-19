import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  buildTokens,
  computeRevealDelay,
  appendRevealDelays,
} from '@/components/ai-search/StreamingText';
import { orderSourcesByCitation } from '@/modules/ai-search/citations';
import type { Citation, Source } from '@/modules/ai-search/types';

function makeSource(id: string, domain = 'example.com'): Source {
  return {
    id,
    title: `Title ${id}`,
    url: `https://${domain}/${id}`,
    domain,
    snippet: `snippet ${id}`,
    text: `full text ${id}`,
    tier: 1,
    confidence: 90,
    isOutdated: false,
    provider: 'exa',
    contentFetched: true,
  };
}

describe('buildTokens citation resolution (D8 render fix)', () => {
  it('resolves chips through citations even when sources are shuffled', () => {
    const srcA = makeSource('src-a', 'a.com');
    const srcB = makeSource('src-b', 'b.com');
    const sources = [srcB, srcA];
    const citations: Citation[] = [
      { marker: 1, sourceId: 'src-a' },
      { marker: 2, sourceId: 'src-b' },
    ];

    const tokens = buildTokens('Alpha [1] beta [2] done.', sources, citations);
    const chips = tokens.filter((t) => t.cite).map((t) => t.cite?.id);

    expect(chips).to.deep.equal(['src-a', 'src-b']);
  });

  it('drops orphan markers with no matching citation', () => {
    const srcA = makeSource('src-a');
    const tokens = buildTokens('Claim [1] orphan [9].', [srcA], [{ marker: 1, sourceId: 'src-a' }]);

    const chips = tokens.filter((t) => t.cite).map((t) => t.cite?.id);
    expect(chips).to.deep.equal(['src-a']);
    expect(tokens.every((t) => !t.text.includes('[9]'))).to.equal(true);
  });

  it('does not fall back to positional sources[marker-1]', () => {
    const srcB = makeSource('src-b');
    // Citation points at a sourceId that is not in the list — old positional
    // code would still have chipped sources[0].
    const tokens = buildTokens('Claim [1].', [srcB], [{ marker: 1, sourceId: 'src-a' }]);

    expect(tokens.filter((t) => t.cite)).to.have.length(0);
  });
});

describe('computeRevealDelay', () => {
  it('cascades words that first appear in the current batch at 30ms/word', () => {
    expect(computeRevealDelay(5, 5)).to.equal(0);
    expect(computeRevealDelay(6, 5)).to.equal(30);
    expect(computeRevealDelay(9, 5)).to.equal(120);
  });

  it('never re-animates words revealed in an earlier batch', () => {
    expect(computeRevealDelay(0, 5)).to.equal(0);
    expect(computeRevealDelay(4, 5)).to.equal(0);
  });
});

describe('appendRevealDelays (StreamingText reveal bookkeeping)', () => {
  it('keeps already-assigned delays and appends the new tail relative to it', () => {
    const prev = [0, 30, 60];
    const next = appendRevealDelays(prev, 6);
    expect(next.slice(0, prev.length)).to.deep.equal(prev);
    expect(next).to.deep.equal([0, 30, 60, 0, 30, 60]);
  });

  it('only assigns delays for tokens that were not rendered before', () => {
    // Two words rendered, four more arrive: each new word cascades on its own
    // batch clock, and the earlier words' delays are untouched.
    const next = appendRevealDelays([0, 30], 4);
    expect(next).to.deep.equal([0, 30, 0, 30]);
  });

  it('returns an equal-length copy when there is nothing new', () => {
    const prev = [0, 30];
    const next = appendRevealDelays(prev, 2);
    expect(next).to.deep.equal(prev);
    expect(next).to.not.equal(prev);
  });
});

describe('orderSourcesByCitation', () => {
  it('orders cited sources first in first-cited order, uncited keep order', () => {
    const srcA = makeSource('src-a');
    const srcB = makeSource('src-b');
    const srcC = makeSource('src-c');
    const citations: Citation[] = [
      { marker: 1, sourceId: 'src-b' },
      { marker: 2, sourceId: 'src-a' },
    ];

    const ordered = orderSourcesByCitation([srcA, srcB, srcC], citations);

    expect(ordered.map((s) => s.id)).to.deep.equal(['src-b', 'src-a', 'src-c']);
  });
});
