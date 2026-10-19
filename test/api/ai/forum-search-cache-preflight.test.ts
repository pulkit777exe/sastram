import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { resetRateLimiters } from '@/lib/services/rate-limit';

const ROUTE_PATH = require.resolve('@/app/api/ai/forum-search/route');
const GUARD_PATH = require.resolve('@/lib/middleware/ai-guard-route');

const VALID_KEYS = {
  exa: '11111111-1111-1111-1111-111111111111',
  tavily: 'tvly-valid-key-for-test',
  gemini: 'AIza-test-key-not-real',
};

const SEARCH_BODY = {
  query: 'cache preflight query',
  config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
  keys: VALID_KEYS,
};

function makeCachedRow() {
  return {
    id: 'cached-row-1',
    synthesis: 'Cached answer [1].',
    sources: [
      {
        id: 'cached-source-1',
        title: 'Cached source',
        url: 'https://docs.python.org/x',
        domain: 'docs.python.org',
        snippet: 'cached snippet',
        text: 'cached text',
        tier: 1,
        confidence: 90,
        isOutdated: false,
        provider: 'exa',
        contentFetched: true,
      },
    ],
    citations: [{ marker: 1, sourceId: 'cached-source-1' }],
    followUps: ['Cached follow-up?'],
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    hitCount: 0,
    confidence: 90,
    sourceCount: 1,
    conflictFound: false,
    conflictData: null,
  };
}

async function collectSSE(res: Response): Promise<string[]> {
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
  return events;
}

describe('POST /api/ai/forum-search — cache/idempotency preflight before guard', () => {
  let stubs: sinon.SinonStub[] = [];
  let restorePrisma: (() => void) | null = null;

  beforeEach(() => {
    resetRateLimiters();
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    if (restorePrisma) {
      restorePrisma();
      restorePrisma = null;
    }
    if (require.cache[GUARD_PATH]) {
      const guardModule = require(GUARD_PATH) as { setGuardDepsForTests: (deps: null) => void };
      guardModule.setGuardDepsForTests(null);
    }
    delete require.cache[ROUTE_PATH];
    delete require.cache[GUARD_PATH];
  });

  it('serves a synthesis cache hit without consuming quota/spend (guard never runs)', async () => {
    restorePrisma = installFakePrisma({
      'user.findUnique': async () => ({ preferences: { expertiseLevel: 'intermediate' } }),
      'aiSearchResult.findFirst': async () => makeCachedRow(),
      'aiSearchResult.update': async () => ({ id: 'cached-row-1' }),
    });

    const checkGuards = sinon.stub().resolves({ ok: true });
    const guardModule = require(GUARD_PATH) as {
      setGuardDepsForTests: (deps: unknown) => void;
    };
    guardModule.setGuardDepsForTests({ checkGuards, checkAccess: async () => {} });
    delete require.cache[ROUTE_PATH];

    const { POST } = require(ROUTE_PATH) as { POST: (request: Request) => Promise<Response> };
    const res = await POST(mockRequest('/api/ai/forum-search', { method: 'POST', body: SEARCH_BODY }));

    expect(res.status).to.equal(200);
    expect(res.headers.get('X-Cache')).to.equal('HIT');

    const phases = (await collectSSE(res)).map((event) => JSON.parse(event).phase);
    expect(phases).to.deep.equal(['searching', 'reading', 'crossref', 'synthesizing', 'done']);
    sinon.assert.notCalled(checkGuards);
  });

  it('still requires a session before the preflight (401 SSE, no prisma reads)', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

    let userReads = 0;
    restorePrisma = installFakePrisma({
      'user.findUnique': async () => {
        userReads += 1;
        return null;
      },
    });

    delete require.cache[ROUTE_PATH];
    const { POST } = require(ROUTE_PATH) as { POST: (request: Request) => Promise<Response> };
    const res = await POST(mockRequest('/api/ai/forum-search', { method: 'POST', body: SEARCH_BODY }));

    expect(res.status).to.equal(401);
    expect(await res.text()).to.contain('event: error');
    expect(userReads).to.equal(0);
  });
});
