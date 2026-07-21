import { describe, it } from 'mocha';
import { expect } from 'chai';
import '../api/helpers'; // Loads prisma, which auto-loads .env so getEnv() validates.
import { parseStructuredSynthesis } from '@/modules/ai-search/service';
import type { Source } from '@/modules/ai-search/types';

function makeSource(id: string, tier: 1 | 2 | 3 | 4 = 1): Source {
  return {
    id,
    title: 'T',
    url: `https://example.com/${id}`,
    domain: 'example.com',
    snippet: 's',
    text: 'full text',
    tier,
    confidence: 90,
    isOutdated: false,
    provider: 'exa',
    contentFetched: true,
  };
}

describe('parseStructuredSynthesis', () => {
  it('parses valid structured JSON with inline citations', () => {
    const sources = [makeSource('exa_1'), makeSource('tavily_2')];
    const raw = JSON.stringify({
      text: 'The sky is blue [1]. But some say red [2].',
      citations: [
        { marker: 1, sourceId: 'exa_1' },
        { marker: 2, sourceId: 'tavily_2' },
      ],
      queryType: 'factual',
      conflictData: null,
    });

    const result = parseStructuredSynthesis(raw, sources);
    expect(result.text).to.contain('[1]');
    expect(result.citations).to.have.length(2);
    expect(result.citations[0]).to.deep.equal({ marker: 1, sourceId: 'exa_1' });
    expect(result.queryType).to.equal('factual');
    expect(result.conflictData).to.equal(null);
  });

  it('falls back to raw text when JSON is invalid', () => {
    const sources = [makeSource('exa_1')];
    const raw = 'This is just plain prose with no JSON at all.';
    const result = parseStructuredSynthesis(raw, sources);
    expect(result.text).to.equal(raw);
    expect(result.citations).to.deep.equal([]);
    expect(result.queryType).to.equal('technical');
  });

  it('falls back when text field is missing/empty', () => {
    const sources = [makeSource('exa_1')];
    const raw = JSON.stringify({ citations: [{ marker: 1, sourceId: 'exa_1' }] });
    const result = parseStructuredSynthesis(raw, sources);
    expect(result.citations).to.deep.equal([]);
    expect(result.text).to.be.a('string');
  });

  it('drops citations whose sourceId is not in the source list', () => {
    const sources = [makeSource('exa_1')];
    const raw = JSON.stringify({
      text: 'Claim [1] and unknown [2].',
      citations: [
        { marker: 1, sourceId: 'exa_1' },
        { marker: 2, sourceId: 'nonexistent' },
      ],
      queryType: 'technical',
    });
    const result = parseStructuredSynthesis(raw, sources);
    expect(result.citations).to.have.length(1);
    expect(result.citations[0].sourceId).to.equal('exa_1');
  });

  it('strips markdown code fences before parsing', () => {
    const sources = [makeSource('exa_1')];
    const raw = '```json\n' + JSON.stringify({ text: 'Fenced [1]', citations: [{ marker: 1, sourceId: 'exa_1' }], queryType: 'opinion' }) + '\n```';
    const result = parseStructuredSynthesis(raw, sources);
    expect(result.text).to.equal('Fenced [1]');
    expect(result.queryType).to.equal('opinion');
    expect(result.citations).to.have.length(1);
  });
});
