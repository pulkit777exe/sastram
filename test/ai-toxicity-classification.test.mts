import { expect } from 'chai';
import sinon from 'sinon';

describe('AI Service — classifyToxicity', function () {
  this.timeout(10000);

  afterEach(function () {
    sinon.restore();
  });

  describe('GeminiService — classifyToxicity parsing', function () {
    it('parses valid JSON toxicity response', async function () {
      const { GeminiService } = await import('@/lib/services/ai');
      // Stub the flashModel to return a known response
      const service = new (GeminiService as any)();
      service.flashModel = {
        generateContent: sinon.stub().resolves({
          response: { text: () => '{"toxicity": 0.85}' },
        }),
      };
      service.model = service.flashModel; // Also stub model for withRetry

      const score = await service.classifyToxicity('Hate speech content');
      expect(score).to.equal(0.85);
    });

    it('clamps score > 1 to 1', async function () {
      const { GeminiService } = await import('@/lib/services/ai');
      const service = new (GeminiService as any)();
      service.flashModel = {
        generateContent: sinon.stub().resolves({
          response: { text: () => '{"toxicity": 1.5}' },
        }),
      };
      service.model = service.flashModel;

      const score = await service.classifyToxicity('Toxic content');
      expect(score).to.equal(1);
    });

    it('clamps negative score to 0', async function () {
      const { GeminiService } = await import('@/lib/services/ai');
      const service = new (GeminiService as any)();
      service.flashModel = {
        generateContent: sinon.stub().resolves({
          response: { text: () => '{"toxicity": -0.5}' },
        }),
      };
      service.model = service.flashModel;

      const score = await service.classifyToxicity('Safe content');
      expect(score).to.equal(0);
    });

    it('returns 0 when AI call fails', async function () {
      const { GeminiService } = await import('@/lib/services/ai');
      const service = new (GeminiService as any)();
      service.flashModel = {
        generateContent: sinon.stub().rejects(new Error('API error')),
      };
      service.model = service.flashModel;

      const score = await service.classifyToxicity('Any content');
      expect(score).to.equal(0);
    });

    it('returns 0 when response has no toxicity field', async function () {
      const { GeminiService } = await import('@/lib/services/ai');
      const service = new (GeminiService as any)();
      service.flashModel = {
        generateContent: sinon.stub().resolves({
          response: { text: () => '{"result": "safe"}' },
        }),
      };
      service.model = service.flashModel;

      const score = await service.classifyToxicity('Content');
      expect(score).to.equal(0);
    });
  });

  describe('OpenAIService — classifyToxicity parsing', function () {
    let fetchStub: sinon.SinonStub;

    beforeEach(function () {
      fetchStub = sinon.stub(globalThis, 'fetch');
    });

    function mockOpenAIResponse(body: string) {
      fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves({
          choices: [{ message: { content: body } }],
        }),
      } as any);
    }

    it('parses valid JSON toxicity response', async function () {
      const { OpenAIService } = await import('@/lib/services/ai');
      const service = new OpenAIService('test-key');
      mockOpenAIResponse('{"toxicity": 0.72}');

      const score = await service.classifyToxicity('Mildly toxic content');
      expect(score).to.equal(0.72);
    });

    it('clamps score > 1 to 1', async function () {
      const { OpenAIService } = await import('@/lib/services/ai');
      const service = new OpenAIService('test-key');
      mockOpenAIResponse('{"toxicity": 99}');

      const score = await service.classifyToxicity('Extreme content');
      expect(score).to.equal(1);
    });

    it('returns 0 when AI call fails', async function () {
      const { OpenAIService } = await import('@/lib/services/ai');
      const service = new OpenAIService('test-key');
      fetchStub.rejects(new Error('API timeout'));

      const score = await service.classifyToxicity('Any content');
      expect(score).to.equal(0);
    });

    it('returns 0 when response has no toxicity field', async function () {
      const { OpenAIService } = await import('@/lib/services/ai');
      const service = new OpenAIService('test-key');
      mockOpenAIResponse('{"error": "invalid"}');

      const score = await service.classifyToxicity('Content');
      expect(score).to.equal(0);
    });
  });
});
