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
  gemini: 'AIza-valid-test-key-at-least-20chars',
};

const SEARCH_BODY = {
  query: 'deadline query',
  config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
  keys: VALID_KEYS,
};

describe('POST /api/ai/forum-search — client abort stops paid work', () => {
  let stubs: sinon.SinonStub[] = [];
  let restorePrisma: (() => void) | null = null;
  let fetchStub: sinon.SinonStub | null = null;

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
    if (fetchStub) {
      fetchStub.restore();
      fetchStub = null;
    }
    if (require.cache[GUARD_PATH]) {
      const guardModule = require(GUARD_PATH) as { setGuardDepsForTests: (deps: null) => void };
      guardModule.setGuardDepsForTests(null);
    }
    delete require.cache[ROUTE_PATH];
    delete require.cache[GUARD_PATH];
  });

  it('emits an error event without calling any provider when the client aborted before the pipeline', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('{}', { status: 200 }));
    restorePrisma = installFakePrisma({
      'user.findUnique': async () => ({ preferences: {} }),
      // Cache miss: the pipeline should never start, hence never write results.
      'aiSearchResult.findFirst': async () => null,
    });

    const guardModule = require(GUARD_PATH) as { setGuardDepsForTests: (deps: unknown) => void };
    guardModule.setGuardDepsForTests({ checkGuards: async () => ({ ok: true }), checkAccess: async () => {} });
    delete require.cache[ROUTE_PATH];

    const controller = new AbortController();
    controller.abort();

    const { POST } = require(ROUTE_PATH) as { POST: (request: Request) => Promise<Response> };
    const res = await POST(
      mockRequest('/api/ai/forum-search', { method: 'POST', body: SEARCH_BODY, signal: controller.signal })
    );

    expect(res.status).to.equal(200);
    expect(await res.text()).to.contain('"phase":"error"');
    sinon.assert.notCalled(fetchStub);
  });
});
