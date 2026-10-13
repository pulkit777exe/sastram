import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';

const POST = () => require('@/app/api/ai/forum-search/route').POST;

describe('POST /api/ai/forum-search', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

    const res = await POST()(mockRequest('/api/ai/forum-search', {
      method: 'POST',
      body: {
        query: 'test query for auth',
        keys: { exa: '123e4567-e89b-12d3-a456-426614174000', tavily: 'tvly-1234567890abcdef', gemini: 'AIzaSyDummyKey12345678901234567890' },
        config: { exaMode: 'agentic', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
      },
    }));
    // Unauthenticated guard rejection on the SSE route is an `event: error`
    // stream (real 401 status), not JSON — see lib/middleware/ai-guard-route.ts.
    const text = await res.text();
    expect(res.status).to.equal(401);
    expect(text).to.contain('event: error');
  });

  it('returns 415 when Content-Type is not application/json', async () => {
    const res = await POST()(mockRequest('/api/ai/forum-search', {
      method: 'POST',
      body: { query: 'test' },
      headers: { 'Content-Type': 'text/plain' },
    }));
    const body = await res.json();
    expect(res.status).to.equal(415);
    expect(body.error?.code).to.equal('UNSUPPORTED_MEDIA_TYPE');
  });
});
