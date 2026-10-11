import { describe, it } from 'mocha';
import { expect } from 'chai';
import { buildTokens } from '@/components/ai-search/StreamingText';
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

    const chips = tokens.filter((t) => t.cite);
    expect(chips).to.have.length(1);
    expect(chips[0]?.id).to.equal('src-a');
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
