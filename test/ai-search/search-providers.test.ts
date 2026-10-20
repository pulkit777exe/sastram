import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  searchWithExa,
  searchWithTavily,
  shouldApplyRecencyFilter,
} from '@/modules/ai-search/search-providers';
import type { QueryClassification, SearchConfig } from '@/modules/ai-search/types';

const classification: QueryClassification = {
  type: 'factual',
  primaryDomain: 'general',
  suggestedSources: [],
  searchTerms: ['latest ai news'],
  isControversial: false,
};

const config: SearchConfig = {
  exaMode: 'agentic',
  tavilyMode: 'search',
  sourceFilter: 'all',
  searchMode: 'standard',
};

function bodyOf(call: sinon.SinonSpyCall): Record<string, unknown> {
  return JSON.parse(String((call.args[1] as RequestInit).body)) as Record<string, unknown>;
}

describe('ai-search recency defaults', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('treats ordinary queries as recency-scoped', () => {
    expect(shouldApplyRecencyFilter('best laptops for developers')).to.be.true;
    expect(shouldApplyRecencyFilter('latest React news')).to.be.true;
  });

  it('leaves explicitly historical queries alone', () => {
    expect(shouldApplyRecencyFilter('history of React')).to.be.false;
    expect(shouldApplyRecencyFilter('best laptops 2021')).to.be.false;
    expect(shouldApplyRecencyFilter('programming in the 1990s')).to.be.false;
  });

  it('adds a one-year Exa publish-date filter by default', async () => {
    fetchStub.resolves(
      new Response(
        JSON.stringify({
          results: [
            { id: 'exa-1', title: 'Fresh result', url: 'https://example.com/a', text: 'content' },
          ],
        }),
        { status: 200 }
      )
    );

    await searchWithExa('latest ai news', classification, 'exa-key', config);

    const body = bodyOf(fetchStub.firstCall);
    const cutoff = new Date(String(body.startPublishedDate)).getTime();
    expect(cutoff).to.be.a('number');
    expect(cutoff).to.be.greaterThan(Date.now() - 366 * 24 * 60 * 60 * 1000);
  });

  it('skips the Exa date filter for historical queries', async () => {
    fetchStub.resolves(
      new Response(
        JSON.stringify({
          results: [
            { id: 'exa-1', title: 'Old result', url: 'https://example.com/a', text: 'content' },
          ],
        }),
        { status: 200 }
      )
    );

    await searchWithExa('history of React', classification, 'exa-key', config);

    expect(bodyOf(fetchStub.firstCall)).to.not.have.property('startPublishedDate');
  });

  it('adds Tavily time_range=year by default', async () => {
    fetchStub.resolves(
      new Response(
        JSON.stringify({
          results: [
            { title: 'Fresh', url: 'https://example.com/a', content: 'content', score: 0.9 },
          ],
        }),
        { status: 200 }
      )
    );

    await searchWithTavily('latest ai news', classification, 'tavily-key', config);

    expect(bodyOf(fetchStub.firstCall).time_range).to.equal('year');
  });

  it('retries without the freshness filter when it returns nothing', async () => {
    fetchStub
      .onFirstCall()
      .resolves(new Response(JSON.stringify({ results: [] }), { status: 200 }))
      .onSecondCall()
      .resolves(
        new Response(
          JSON.stringify({
            results: [
              { id: 'exa-1', title: 'Older fallback', url: 'https://example.com/a', text: 'content' },
            ],
          }),
          { status: 200 }
        )
      );

    const sources = await searchWithExa('latest ai news', classification, 'exa-key', config);

    expect(fetchStub.callCount).to.equal(2);
    expect(bodyOf(fetchStub.firstCall).startPublishedDate).to.be.a('string');
    expect(bodyOf(fetchStub.secondCall)).to.not.have.property('startPublishedDate');
    expect(sources).to.have.length(1);
  });
});
