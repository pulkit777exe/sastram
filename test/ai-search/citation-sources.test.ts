import { describe, it } from 'mocha';
import { expect } from 'chai';
import { renderCitationSources } from '@/modules/ai-search/citation-sources';
import { toMarkdown } from '@/modules/collections/metadata';

const SOURCES = [
  { id: 'a', title: 'Alpha', url: 'https://a.com/x', domain: 'a.com', tier: 1, confidence: 90, provider: 'exa' },
  { id: 'b', title: 'Beta', url: 'https://b.com/y', domain: 'b.com', tier: 2, confidence: 80, provider: 'tavily' },
];

describe('renderCitationSources', () => {
  it('renders markers in citation order', () => {
    const lines = renderCitationSources(
      [
        { marker: 2, sourceId: 'b' },
        { marker: 1, sourceId: 'a' },
      ],
      SOURCES
    );
    expect(lines).to.have.length(2);
    expect(lines[0]).to.contain('[1]');
    expect(lines[0]).to.contain('https://a.com/x');
    expect(lines[1]).to.contain('[2]');
  });

  it('drops orphan markers with no matching source', () => {
    expect(renderCitationSources([{ marker: 1, sourceId: 'ghost' }], SOURCES)).to.deep.equal([]);
  });
});

describe('toMarkdown ai_synthesis with citations', () => {
  it('appends a Sources section from persisted citations', () => {
    const md = toMarkdown({
      type: 'ai_synthesis',
      text: 'Prose [1].',
      citations: [{ marker: 1, sourceId: 'a' }],
      sources: SOURCES,
    });
    expect(md).to.contain('## AI Synthesis');
    expect(md).to.contain('**Sources**');
    expect(md).to.contain('[1] Alpha');
  });

  it('omits the Sources section when citations are absent', () => {
    const md = toMarkdown({ type: 'ai_synthesis', text: 'Prose.' });
    expect(md).to.contain('## AI Synthesis');
    expect(md).to.not.contain('**Sources**');
  });
});
