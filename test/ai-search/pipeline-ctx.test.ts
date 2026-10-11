import { describe, it } from 'mocha';
import { expect } from 'chai';
import '../api/helpers'; // Loads prisma, which auto-loads .env so getEnv() validates.
import { executeAISearch } from '@/modules/ai-search/service';
import type {
  LlmAdapter,
  SearchAdapter,
  SearchCtx,
  SearchStore,
} from '@/modules/ai-search/ports';
import type {
  AISearchResponse,
  QueryClassification,
  SearchConfig,
  Source,
} from '@/modules/ai-search/types';

const CONFIG: SearchConfig = {
  exaMode: 'instant',
  tavilyMode: 'search',
  sourceFilter: 'all',
  searchMode: 'standard',
};

function makeSource(id: string, provider: 'exa' | 'tavily'): Source {
  return {
    id,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    snippet: `snippet ${id}`,
    text: `full text ${id}`,
    tier: 1,
    confidence: 90,
    isOutdated: false,
    provider,
    contentFetched: true,
  };
}

const CLASSIFICATION: QueryClassification = {
  type: 'factual',
  primaryDomain: 'programming',
  suggestedSources: ['example.com'],
  searchTerms: ['stub query'],
  isControversial: false,
};

/** Offline LLM: returns canned JSON per phase, counting every call. */
function makeLlmStub(calls: { count: number }): LlmAdapter {
  return {
    generateText: async (prompt) => {
      calls.count++;
      if (prompt.includes('Classify this forum search query')) {
        return JSON.stringify(CLASSIFICATION);
      }
      if (prompt.includes('follow-up questions')) {
        return JSON.stringify({ followUps: ['stub follow-up 1', 'stub follow-up 2', 'stub follow-up 3'] });
      }
      if (prompt.includes('genuine contradictions')) {
        return JSON.stringify({ detected: false, description: '', sideA: '', sideB: '' });
      }
      return JSON.stringify({
        text: 'Stub answer one [1] and two [2].',
        citations: [
          { marker: 1, sourceId: 'stub-exa-1' },
          { marker: 2, sourceId: 'stub-tavily-1' },
        ],
        queryType: 'factual',
        conflictData: null,
      });
    },
  };
}

function makeSearchStub(calls: { exa: number; tavily: number }): SearchAdapter {
  return {
    exa: async () => {
      calls.exa++;
      return [makeSource('stub-exa-1', 'exa')];
    },
    tavily: async () => {
      calls.tavily++;
      return { sources: [makeSource('stub-tavily-1', 'tavily')], answer: 'stub tavily answer' };
    },
  };
}

function makeStoreStub(seed: AISearchResponse | null = null) {
  const calls = { get: 0, put: 0 };
  let cached = seed;
  const store: SearchStore = {
    get: async () => {
      calls.get++;
      return cached;
    },
    put: async (_query, result) => {
      calls.put++;
      cached = {
        synthesis: result.synthesis,
        sources: result.sources,
        phase: 'done',
      } as AISearchResponse;
    },
  };
  return { store, calls };
}

function makeCtx(
  llmCalls: { count: number },
  searchCalls: { exa: number; tavily: number },
  seed: AISearchResponse | null = null
): { ctx: SearchCtx; storeCalls: { get: number; put: number } } {
  const { store, calls: storeCalls } = makeStoreStub(seed);
  const ctx: SearchCtx = {
    llm: makeLlmStub(llmCalls),
    search: makeSearchStub(searchCalls),
    store,
  };
  return { ctx, storeCalls };
}

describe('executeAISearch with injected SearchCtx (D8)', () => {
  it('runs the full pipeline offline with stub llm/search/store', async () => {
    const llmCalls = { count: 0 };
    const searchCalls = { exa: 0, tavily: 0 };
    const { ctx, storeCalls } = makeCtx(llmCalls, searchCalls);

    const result = await executeAISearch('stub query offline', CONFIG, ctx);

    expect(result.phase).to.equal('done');
    expect(result.synthesis.text).to.contain('[1]');
    expect(result.synthesis.citations).to.have.length(2);
    expect(result.synthesis.citations?.[0]).to.deep.equal({ marker: 1, sourceId: 'stub-exa-1' });
    expect(result.sources).to.have.length(2);
    expect(result.followUps).to.have.length(3);
    expect(result.timings).to.exist;
    expect(llmCalls.count).to.be.greaterThan(0);
    expect(searchCalls.exa).to.equal(1);
    expect(searchCalls.tavily).to.equal(1);
    expect(storeCalls.get).to.equal(1);
  });

  it('returns the cached result with zero llm/search executes on a store hit', async () => {
    const cached = {
      synthesis: {
        content: 'Cached prose [1].',
        text: 'Cached prose [1].',
        citations: [{ marker: 1, sourceId: 'cached-1' }],
        queryType: 'factual',
        sourceCount: 1,
        conflictData: { detected: false, description: '', sideA: '', sideB: '' },
        processingTimeMs: 0,
      },
      sources: [makeSource('cached-1', 'exa')],
      phase: 'done',
    } as unknown as AISearchResponse & { followUps: string[] };
    (cached as unknown as { followUps: string[] }).followUps = ['cached follow-up'];

    const llmCalls = { count: 0 };
    const searchCalls = { exa: 0, tavily: 0 };
    const { ctx } = makeCtx(llmCalls, searchCalls, cached);

    const result = await executeAISearch('cached query', CONFIG, ctx);

    expect(llmCalls.count).to.equal(0);
    expect(searchCalls.exa).to.equal(0);
    expect(searchCalls.tavily).to.equal(0);
    expect(result.synthesis.content).to.equal('Cached prose [1].');
    expect(result.followUps).to.deep.equal(['cached follow-up']);
    expect(result.phase).to.equal('done');
  });
});
