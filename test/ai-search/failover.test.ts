import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { generateText } from '@/modules/ai-search/service';

/**
 * Verifies the Gemini→OpenAI failover (harness §5). Both providers are reached
 * via `fetch`, so we intercept at the network layer: the Gemini host is forced
 * to return a 429 (quota), the OpenAI host returns a chat completion.
 */
describe('ai-search generateText provider failover (harness §5)', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  function geminiQuotaResponse() {
    return new Response(
      JSON.stringify({ error: { code: 429, message: 'RESOURCE_EXHAUSTED' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  function openaiResponse(content: string) {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  it('falls back to OpenAI when Gemini is over quota and an openai key is supplied', async () => {
    let openaiCalled = false;
    let geminiCalled = false;
    fetchStub.callsFake(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com')) {
        geminiCalled = true;
        return geminiQuotaResponse();
      }
      if (u.includes('api.openai.com')) {
        openaiCalled = true;
        expect(u).to.contain('api.openai.com/v1/chat/completions');
        return openaiResponse('{"ok":true}');
      }
      return new Response('{}', { status: 200 });
    });

    const text = await generateText('hello', {
      geminiKey: 'AIza-test',
      openaiKey: 'sk-test',
      model: 'gemini-2.0-flash',
    });

    expect(geminiCalled).to.equal(true);
    expect(openaiCalled).to.equal(true);
    expect(text).to.equal('{"ok":true}');
  });

  it('does NOT fall back when no openai key is supplied (rethrows quota error)', async () => {
    fetchStub.callsFake(async () => geminiQuotaResponse());
    let threw = false;
    try {
      await generateText('hello', { geminiKey: 'AIza-test', model: 'gemini-2.0-flash' });
    } catch (err) {
      threw = true;
      expect((err as Error).message).to.match(/quota|RESOURCE_EXHAUSTED|429/i);
    }
    expect(threw).to.equal(true);
  });

  it('does NOT fall back on a non-quota Gemini error (rethrows the original error)', async () => {
    fetchStub.callsFake(
      async () =>
        new Response(JSON.stringify({ error: { code: 400, message: 'bad request' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    let threw = false;
    try {
      await generateText('hello', {
        geminiKey: 'AIza-test',
        openaiKey: 'sk-test',
        model: 'gemini-2.0-flash',
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).to.match(/bad request/i);
    }
    expect(threw).to.equal(true);
  });
});
