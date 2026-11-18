import { describe, it } from 'mocha';
import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { validateCitations } from '@/modules/ai-search/citations';
import type { Source } from '@/modules/ai-search/types';

type Golden = { id: string; query: string; type: string; mode: string };

function makeSource(id: string): Source {
  return {
    id,
    title: 'T',
    url: `https://example.com/${id}`,
    domain: 'example.com',
    snippet: 's',
    text: 'full fetched text',
    tier: 2,
    confidence: 80,
    isOutdated: false,
    provider: 'exa',
    sourceLabel: 'Web',
    tierLabel: 'Web',
    contentFetched: true,
  };
}

describe('Phase 4 eval harness (golden dataset, deterministic)', () => {
  const goldenPath = path.join(process.cwd(), 'test/fixtures/ai-search-golden.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as { version: number; queries: Golden[] };

  it('contains 40 golden queries with required fields and unique ids', () => {
    expect(golden.queries).to.have.length(40);
    const ids = new Set<string>();
    for (const q of golden.queries) {
      expect(q.id).to.be.a('string').and.not.empty;
      expect(q.query).to.be.a('string').and.not.empty;
      expect(['quick', 'pro', 'deep']).to.include(q.mode);
      expect(['technical', 'factual', 'comparison', 'opinion']).to.include(q.type);
      expect(ids.has(q.id)).to.equal(false);
      ids.add(q.id);
    }
  });

  it('citation validity: grounded markers survive, orphans/unfetched are dropped', () => {
    const sources = [makeSource('s1'), makeSource('s2'), { ...makeSource('s3'), contentFetched: false }];
    const text = 'Claim A [1]. Claim B [2]. Bad [3]. Orphan [9].';
    const { text: out, citations } = validateCitations(text, [
      { marker: 1, sourceId: 's1' },
      { marker: 2, sourceId: 's2' },
      { marker: 3, sourceId: 's3' },
    ], sources);
    expect(out).to.not.include('[9]');
    expect(out).to.not.include('[3]');
    expect(citations.map((c) => c.sourceId)).to.deep.equal(['s1', 's2']);
  });

  it('citation validity: markers are renumbered contiguously in first-seen order', () => {
    const sources = [makeSource('a'), makeSource('b')];
    const { text, citations } = validateCitations('B first [2] then A [1] then B again [2]', [
      { marker: 1, sourceId: 'a' },
      { marker: 2, sourceId: 'b' },
    ], sources);
    expect(text).to.equal('B first [1] then A [2] then B again [1]');
    expect(citations).to.deep.equal([{ marker: 1, sourceId: 'b' }, { marker: 2, sourceId: 'a' }]);
  });
});
