import { describe, it } from 'mocha';
import { expect } from 'chai';
import { validateCitations } from '@/modules/ai-search/citations';
import type { Source } from '@/modules/ai-search/types';

function makeSource(id: string, opts: { tier?: 1 | 2 | 3 | 4; fetched?: boolean } = {}): Source {
  return {
    id,
    title: 'T',
    url: `https://example.com/${id}`,
    domain: 'example.com',
    snippet: 's',
    text: 'full text',
    tier: opts.tier ?? 1,
    confidence: 90,
    isOutdated: false,
    provider: 'exa',
    contentFetched: opts.fetched ?? true,
  };
}

describe('validateCitations (harness §2)', () => {
  it('drops an orphan marker in text with no matching citation', () => {
    const sources = [makeSource('exa_1')];
    const { text, citations } = validateCitations(
      'Claim one [1] and orphan [2].',
      [{ marker: 1, sourceId: 'exa_1' }],
      sources
    );
    expect(text).to.equal('Claim one [1] and orphan .');
    expect(citations).to.have.length(1);
    expect(citations[0]).to.deep.equal({ marker: 1, sourceId: 'exa_1' });
  });

  it('drops an orphan citation with no marker in text', () => {
    const sources = [makeSource('exa_1'), makeSource('exa_2')];
    const { citations } = validateCitations(
      'Only one claim [1].',
      [
        { marker: 1, sourceId: 'exa_1' },
        { marker: 2, sourceId: 'exa_2' },
      ],
      sources
    );
    expect(citations).to.have.length(1);
  });

  it('renumbers markers to first-appearance order when model numbers out of order', () => {
    // Model cited [2] before [1] in the prose.
    const sources = [makeSource('exa_1'), makeSource('exa_2')];
    const { text, citations } = validateCitations(
      'Second source mentioned [2] then first [1].',
      [
        { marker: 1, sourceId: 'exa_1' },
        { marker: 2, sourceId: 'exa_2' },
      ],
      sources
    );
    // Prose order is exa_2 then exa_1 → markers become [1] and [2].
    expect(text).to.equal('Second source mentioned [1] then first [2].');
    expect(citations[0]).to.deep.equal({ marker: 1, sourceId: 'exa_2' });
    expect(citations[1]).to.deep.equal({ marker: 2, sourceId: 'exa_1' });
  });

  it('collapses duplicate markers for the same source to the first-seen marker', () => {
    const sources = [makeSource('exa_1')];
    // Model emitted two different markers pointing at the same source.
    const { text, citations } = validateCitations(
      'Repeated claim [1] and again [2].',
      [
        { marker: 1, sourceId: 'exa_1' },
        { marker: 2, sourceId: 'exa_1' },
      ],
      sources
    );
    expect(text).to.equal('Repeated claim [1] and again [1].');
    expect(citations).to.have.length(1);
    expect(citations[0].marker).to.equal(1);
  });

  it('never cites a source whose content was not fetched (contentFetched=false)', () => {
    const sources = [makeSource('exa_1', { fetched: false })];
    const { citations } = validateCitations(
      'Unverified claim [1].',
      [{ marker: 1, sourceId: 'exa_1' }],
      sources
    );
    expect(citations).to.have.length(0);
  });

  it('flags over-cited sources beyond the reuse cap', () => {
    const sources = [makeSource('exa_1')];
    const citations = Array.from({ length: 10 }, (_, i) => ({ marker: i + 1, sourceId: 'exa_1' }));
    const { overCitedSources } = validateCitations(
      citations.map((c) => `claim ${c.marker} [${c.marker}].`).join(' '),
      citations,
      sources,
      5
    );
    expect(overCitedSources).to.equal(1);
  });

  it('does not throw on malformed marker syntax', () => {
    const sources = [makeSource('exa_1')];
    const { text, citations } = validateCitations(
      'No real markers here, just [abc] text.',
      [{ marker: 1, sourceId: 'exa_1' }],
      sources
    );
    expect(() => text).to.not.throw();
    expect(citations).to.have.length(0);
  });
});
