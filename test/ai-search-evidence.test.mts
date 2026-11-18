import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { prisma } from '@/lib/infrastructure/prisma';
import { cacheResult, getCachedResult } from '@/modules/ai-search/cache';
import type { AISearchPipelineResult } from '@/modules/ai-search/service';

const source = {
  id: 's1',
  title: 'Src',
  url: 'https://example.com',
  domain: 'example.com',
  snippet: 'snip',
  text: 'text',
  tier: 2 as const,
  confidence: 80,
  isOutdated: false,
  provider: 'exa' as const,
  contentFetched: true,
};

function makeResult(): AISearchPipelineResult {
  return {
    synthesis: {
      text: 'Answer [1]',
      citations: [{ marker: 1, sourceId: 's1' }],
      queryType: 'factual',
      confidence: 75,
      sourceCount: 1,
      conflictData: { detected: false, description: '', sideA: '', sideB: '' },
      processingTimeMs: 10,
      evidence: [{ id: 'e1', sourceId: 's1', claim: 'Claim one', excerpt: 'Excerpt' }],
    },
    sources: [source],
    followUps: ['Next?'],
    timings: { provider: 'test' },
  } as AISearchPipelineResult;
}

function set(model: string, method: string, fn: any) {
  const m = (prisma as any)[model];
  const orig = m[method];
  m[method] = fn;
  return () => { m[method] = orig; };
}

describe('AI search evidence persistence', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('cacheResult stores evidence in ai_search_results', async () => {
    let stored: any = null;
    restores.push(set('user', 'upsert', async () => ({ id: 'anonymous' })));
    restores.push(set('aiSearchSession', 'findFirst', async () => ({ id: 'sess-anon' })));
    restores.push(set('aiSearchResult', 'create', async (args: any) => {
      stored = args.data;
      return { id: 'r1', createdAt: new Date(), ...stored };
    }));

    await cacheResult('test evidence query', makeResult(), 'factual');

    expect(stored).to.not.equal(null);
    expect(stored.evidence).to.deep.equal([{ id: 'e1', sourceId: 's1', claim: 'Claim one', excerpt: 'Excerpt' }]);
  });

  it('getCachedResult returns evidence from cached synthesis (round-trip shape)', async () => {
    restores.push(set('aiSearchResult', 'findFirst', async () => ({
      id: 'r1',
      synthesis: 'Answer [1]',
      citations: [{ marker: 1, sourceId: 's1' }],
      followUps: ['Next?'],
      evidence: [{ id: 'e1', sourceId: 's1', claim: 'Claim one', excerpt: 'Excerpt' }],
      conflictData: { detected: false, description: '', sideA: '', sideB: '' },
      confidence: 75,
      sourceCount: 1,
      sources: [source],
      conflictFound: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })));
    restores.push(set('aiSearchResult', 'update', async () => ({})));

    const cached = await getCachedResult('test evidence query');
    expect(cached, 'expected cache hit').to.not.equal(null);
    expect((cached as any).synthesis.evidence).to.deep.equal([
      { id: 'e1', sourceId: 's1', claim: 'Claim one', excerpt: 'Excerpt' },
    ]);
  });

  it('getCachedResult defaults missing evidence to empty array', async () => {
    restores.push(set('aiSearchResult', 'findFirst', async () => ({
      id: 'r2',
      synthesis: 'Answer',
      citations: [],
      followUps: [],
      evidence: null,
      conflictData: null,
      confidence: 50,
      sourceCount: 0,
      sources: [],
      conflictFound: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })));
    restores.push(set('aiSearchResult', 'update', async () => ({})));

    const cached = await getCachedResult('old query');
    expect(cached, 'expected cache hit').to.not.equal(null);
    expect((cached as any).synthesis.evidence).to.deep.equal([]);
  });
});
