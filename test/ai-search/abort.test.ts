import { describe, it } from 'mocha';
import { expect } from 'chai';
import '../api/helpers'; // Loads prisma, which auto-loads .env so getEnv() validates.
import { executeAISearch } from '@/modules/ai-search/service';
import { AbortError } from '@/lib/utils/retry';
import type { LlmAdapter, SearchAdapter, SearchCtx } from '@/modules/ai-search/ports';
import type { QueryClassification, SearchConfig, Source } from '@/modules/ai-search/types';

const CONFIG: SearchConfig = {
  exaMode: 'instant',
  tavilyMode: 'search',
  sourceFilter: 'all',
  searchMode: 'standard',
};

const CLASSIFICATION: QueryClassification = {
  type: 'factual',
  primaryDomain: 'programming',
  suggestedSources: ['example.com'],
  searchTerms: ['abort query'],
  isControversial: false,
};

function makeSource(id: string): Source {
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
    provider: 'exa',
    contentFetched: true,
  };
}

function makeSearchStub(calls: { exa: number; tavily: number }): SearchAdapter {
  return {
    exa: async () => {
      calls.exa++;
      return [makeSource('stub-1')];
    },
    tavily: async () => {
      calls.tavily++;
      return { sources: [], answer: undefined };
    },
  };
}

async function runAborted(ctx: SearchCtx): Promise<unknown> {
  try {
    await executeAISearch('abort query', CONFIG, ctx);
    return null;
  } catch (error) {
    return error;
  }
}

describe('executeAISearch deadline signal', () => {
  it('does not start any phase when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const searchCalls = { exa: 0, tavily: 0 };
    let llmCalls = 0;
    const llm: LlmAdapter = {
      generateText: async () => {
        llmCalls++;
        return '{}';
      },
    };

    const caught = await runAborted({ llm, search: makeSearchStub(searchCalls), signal: controller.signal });

    expect(caught).to.be.instanceOf(AbortError);
    expect(llmCalls).to.equal(0);
    expect(searchCalls.exa).to.equal(0);
    expect(searchCalls.tavily).to.equal(0);
  });

  it('stops before the search phase when the signal aborts during classify', async () => {
    const controller = new AbortController();
    const searchCalls = { exa: 0, tavily: 0 };
    const llm: LlmAdapter = {
      generateText: async () => {
        controller.abort();
        return JSON.stringify(CLASSIFICATION);
      },
    };

    const caught = await runAborted({ llm, search: makeSearchStub(searchCalls), signal: controller.signal });

    expect(caught).to.be.instanceOf(AbortError);
    expect(searchCalls.exa).to.equal(0);
    expect(searchCalls.tavily).to.equal(0);
  });
});
