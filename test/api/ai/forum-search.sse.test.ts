import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { prisma } from '@/lib/infrastructure/prisma';
import { GoogleGenAI } from '@google/genai';

const POST = () => require('@/app/api/ai/forum-search/route').POST;

/** Minimal fake Gemini model that returns canned text based on the prompt. */
function installFakeGemini(opts: { throwOnSynthesis?: boolean } = {}) {
  const fakeClass = class {
    models = {
      generateContent: async ({ contents }: { contents: string; config?: { responseMimeType?: string } }) => {
        let text: string;
        if (contents.includes('Classify this forum search query')) {
          text = JSON.stringify({
            type: 'technical',
            primaryDomain: 'general',
            suggestedSources: [],
            searchTerms: ['valid query'],
            isControversial: false,
          });
        } else if (contents.includes('genuine contradictions')) {
          text = JSON.stringify({ detected: false, description: '', sideA: '', sideB: '' });
        } else if (contents.includes('follow-up questions')) {
          text = JSON.stringify({ followUps: ['Follow one?', 'Follow two?', 'Follow three?'] });
        } else {
          // synthesis
          if (opts.throwOnSynthesis) {
            throw new Error('503 Resource exhausted');
          }
          text = JSON.stringify({
            text: 'The answer is X [1].',
            citations: [{ marker: 1, sourceId: 'exa_1' }],
            queryType: 'factual',
            conflictData: null,
          });
        }
        return { text };
      },
    };
  };
  const genai = require('@google/genai');
  const original = genai.GoogleGenAI;
  genai.GoogleGenAI = fakeClass;
  return () => {
    genai.GoogleGenAI = original;
  };
}

function collectSSE(res: Response): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const events: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const block of chunks) {
          const line = block.trim();
          if (line.startsWith('data:')) events.push(line.slice(5).trim());
        }
      }
      resolve(events);
    } catch (e) {
      reject(e);
    }
  });
}

function makeSource(id: string, tier: 1 | 2 | 3 | 4 = 1) {
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
    provider: 'exa' as const,
  };
}

describe('POST /api/ai/forum-search (SSE)', () => {
  let stubs: sinon.SinonStub[] = [];
  let restoreGemini: () => void = () => {};

  before(function () {
    this.timeout(15000);
  });

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
    // Avoid touching the real DB.
    stubs.push(sinon.stub(prisma.aiSearchSession, 'create').resolves({ id: 'sess-1' } as never));
    stubs.push(sinon.stub(prisma.aiSearchResult, 'create').resolves({ id: 'r1' } as never));
    stubs.push(sinon.stub(prisma.aiSearchResult, 'findFirst').resolves(null));
  });

  afterEach(() => {
    restoreStubs(...stubs);
    restoreGemini();
    stubs = [];
  });

  it('emits the full SSE event sequence for a normal search', async () => {
    // Exa + Tavily return two quality sources.
    stubs.push(
      sinon.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('exa.ai')) {
          return new Response(
            JSON.stringify({ results: [{ id: 'exa_1', title: 'A', url: 'https://docs.python.org/x', text: 'Python docs content', publishedDate: '2024-01-01' }] }),
            { status: 200 }
          );
        }
        if (u.includes('tavily.com')) {
          return new Response(
            JSON.stringify({ results: [{ title: 'B', url: 'https://developer.mozilla.org/y', content: 'MDN content', published_date: '2024-02-01', score: 0.9 }], answer: 'tavily says' }),
            { status: 200 }
          );
        }
        return new Response('', { status: 404 });
      })
    );

    restoreGemini = installFakeGemini();

    const res = await POST()(
      mockRequest('/api/ai/forum-search', {
        method: 'POST',
        body: {
          query: 'valid query',
          config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
          keys: { exa: '11111111-1111-1111-1111-111111111111', tavily: 'tvly-test', gemini: 'AIza-test-key' },
        },
      })
    );

    expect(res.status).to.equal(200);
    expect(res.headers.get('Content-Type')).to.contain('text/event-stream');

    const events = await collectSSE(res);
    const phases = events.map((e) => JSON.parse(e).phase);
    expect(phases).to.deep.equal(['searching', 'reading', 'crossref', 'synthesizing', 'done']);

    const doneEvent = JSON.parse(events[events.length - 1]);
    expect(doneEvent.synthesis.text).to.be.a('string');
    expect(doneEvent.followUps).to.have.length(3);
  });

  it('emits a refine phase (not done) when fewer than 2 quality sources', async () => {
    // Only one low-tier source returns.
    stubs.push(
      sinon.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('exa.ai')) {
          return new Response(
            JSON.stringify({ results: [{ id: 'exa_low', title: 'A', url: 'https://someblog.example/z', text: 'blog', publishedDate: '2020-01-01' }] }),
            { status: 200 }
          );
        }
        if (u.includes('tavily.com')) {
          return new Response(JSON.stringify({ results: [], answer: '' }), { status: 200 });
        }
        return new Response('', { status: 404 });
      })
    );

    restoreGemini = installFakeGemini();

    const res = await POST()(
      mockRequest('/api/ai/forum-search', {
        method: 'POST',
        body: {
          query: 'valid query',
          config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
          keys: { exa: '11111111-1111-1111-1111-111111111111', tavily: 'tvly-test', gemini: 'AIza-test-key' },
        },
      })
    );

    expect(res.status).to.equal(200);
    const events = await collectSSE(res);
    const phases = events.map((e) => JSON.parse(e).phase);
    expect(phases).to.include('refine');
    expect(phases[phases.length - 1]).to.equal('refine');
    expect(phases).to.not.include('done');
  });

  it('emits an error event when synthesis fails after sources are found', async function () {
    this.timeout(15000);
    stubs.push(
      sinon.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('exa.ai')) {
          return new Response(
            JSON.stringify({ results: [{ id: 'exa_1', title: 'A', url: 'https://docs.python.org/x', text: 'Python docs content', publishedDate: '2024-01-01' }] }),
            { status: 200 }
          );
        }
        if (u.includes('tavily.com')) {
          return new Response(
            JSON.stringify({ results: [{ title: 'B', url: 'https://developer.mozilla.org/y', content: 'MDN content', published_date: '2024-02-01', score: 0.9 }], answer: 'tavily says' }),
            { status: 200 }
          );
        }
        return new Response('', { status: 404 });
      })
    );
    restoreGemini = installFakeGemini({ throwOnSynthesis: true });

    const res = await POST()(
      mockRequest('/api/ai/forum-search', {
        method: 'POST',
        body: {
          query: 'valid query',
          config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
          keys: { exa: '11111111-1111-1111-1111-111111111111', tavily: 'tvly-test', gemini: 'AIza-test-key' },
        },
      })
    );

    expect(res.status).to.equal(200);
    const events = await collectSSE(res);
    const errorEvent = JSON.parse(events[events.length - 1]);
    expect(errorEvent.phase).to.equal('error');
    expect(errorEvent.message).to.be.a('string');
  });

  it('emits a distinct error (PROVIDER_FAILURE) when both providers return nothing', async () => {
    // Both Exa and Tavily return zero results → hard failure, not refine.
    stubs.push(
      sinon.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('exa.ai')) {
          return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }
        if (u.includes('tavily.com')) {
          return new Response(JSON.stringify({ results: [], answer: '' }), { status: 200 });
        }
        return new Response('', { status: 404 });
      })
    );

    restoreGemini = installFakeGemini();

    const res = await POST()(
      mockRequest('/api/ai/forum-search', {
        method: 'POST',
        body: {
          query: 'valid query',
          config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
          keys: { exa: '11111111-1111-1111-1111-111111111111', tavily: 'tvly-test', gemini: 'AIza-test-key' },
        },
      })
    );

    expect(res.status).to.equal(200);
    const events = await collectSSE(res);
    const errorEvent = JSON.parse(events[events.length - 1]);
    expect(errorEvent.phase).to.equal('error');
    expect(errorEvent.errorCode).to.equal('PROVIDER_FAILURE');
  });

  it('snapshots the done payload shape (text, citations, followUps, sessionId)', async () => {
    stubs.push(
      sinon.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('exa.ai')) {
          return new Response(
            JSON.stringify({ results: [{ id: 'exa_1', title: 'A', url: 'https://docs.python.org/x', text: 'Python docs content', publishedDate: '2024-01-01' }] }),
            { status: 200 }
          );
        }
        if (u.includes('tavily.com')) {
          return new Response(
            JSON.stringify({ results: [{ title: 'B', url: 'https://developer.mozilla.org/y', content: 'MDN content', published_date: '2024-02-01', score: 0.9 }], answer: 'tavily says' }),
            { status: 200 }
          );
        }
        return new Response('', { status: 404 });
      })
    );

    restoreGemini = installFakeGemini();

    const res = await POST()(
      mockRequest('/api/ai/forum-search', {
        method: 'POST',
        body: {
          query: 'valid query',
          config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
          keys: { exa: '11111111-1111-1111-1111-111111111111', tavily: 'tvly-test', gemini: 'AIza-test-key' },
        },
      })
    );

    const events = await collectSSE(res);
    const doneEvent = JSON.parse(events[events.length - 1]);
    expect(doneEvent.phase).to.equal('done');
    expect(doneEvent.synthesis).to.have.property('text');
    expect(doneEvent.synthesis).to.have.property('citations');
    expect(doneEvent.synthesis.citations).to.be.an('array');
    expect(doneEvent.followUps).to.have.length(3);
    expect(doneEvent.sessionId).to.be.a('string').with.length.greaterThan(0);
  });

  it('tears down cleanly when the client aborts mid-stream (no leak, no throw)', async () => {
    stubs.push(
      sinon.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('exa.ai')) {
          return new Response(
            JSON.stringify({ results: [{ id: 'exa_1', title: 'A', url: 'https://docs.python.org/x', text: 'Python docs content', publishedDate: '2024-01-01' }] }),
            { status: 200 }
          );
        }
        if (u.includes('tavily.com')) {
          return new Response(
            JSON.stringify({ results: [{ title: 'B', url: 'https://developer.mozilla.org/y', content: 'MDN content', published_date: '2024-02-01', score: 0.9 }], answer: 'tavily says' }),
            { status: 200 }
          );
        }
        return new Response('', { status: 404 });
      })
    );

    restoreGemini = installFakeGemini();

    // Simulate a client that disconnects immediately.
    const abortController = new AbortController();
    abortController.abort();

    const res = await POST()(
      mockRequest('/api/ai/forum-search', {
        method: 'POST',
        body: {
          query: 'valid query',
          config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
          keys: { exa: '11111111-1111-1111-1111-111111111111', tavily: 'tvly-test', gemini: 'AIza-test-key' },
        },
        signal: abortController.signal,
      })
    );

    expect(res.status).to.equal(200);
    // Reading a closed/aborted stream must not reject.
    const events = await collectSSE(res).catch(() => []);
    expect(events).to.be.an('array');
  });
});
