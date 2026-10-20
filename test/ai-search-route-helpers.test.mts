import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  deriveTitle,
  invalidKeysMessage,
  invalidKeysResponse,
  mapStreamError,
  mapTopLevelError,
  missingKeysMessage,
  missingKeysResponse,
  resolveApiKeys,
  validateSearchBody,
  type ResolvedKeys,
} from '../modules/ai-search/route-helpers';
import { AISearchError } from '../modules/ai-search/synthesis';
import { AppError } from '../lib/utils/errors';

const baseBody = {
  query: 'how do polls work',
  keys: { exa: 'k', tavily: 'k', gemini: 'k' },
  config: { exaMode: 'instant', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
} as const;

const fullKeys: ResolvedKeys = { exaKey: 'e', tavilyKey: 't', geminiKey: 'g', openaiKey: 'o' };

describe('ai-search route helpers', () => {
  describe('deriveTitle', () => {
    it('takes the first six words', () => {
      expect(deriveTitle('one two three four five six seven eight')).to.equal('one two three four five six');
    });

    it('truncates past 60 chars', () => {
      const title = deriveTitle(`a ${'b'.repeat(100)}`);
      expect(title.length).to.be.lessThanOrEqual(60);
      expect(title.endsWith('…')).to.be.true;
    });
  });

  describe('validateSearchBody', () => {
    it('accepts a valid request', () => {
      expect(validateSearchBody(structuredClone(baseBody)).query).to.be.a('string');
    });

    it('accepts an empty keys object so server env keys can be used', () => {
      const parsed = validateSearchBody({ ...structuredClone(baseBody), keys: {} });
      expect(parsed.keys).to.deep.equal({});
    });

    it('accepts an omitted keys object', () => {
      const body = structuredClone(baseBody) as Record<string, unknown>;
      delete body.keys;
      expect(validateSearchBody(body).keys).to.deep.equal({});
    });

    it('short query throws VALIDATION_ERROR 400, not 500', () => {
      try {
        validateSearchBody({ ...structuredClone(baseBody), query: 'x' });
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(AppError);
        expect((error as AppError).code).to.equal('VALIDATION_ERROR');
        expect((error as AppError).statusCode).to.equal(400);
      }
    });
  });

  describe('resolveApiKeys', () => {
    it('explicit fallbacks win over empty client keys, no env read', () => {
      const keys = resolveApiKeys({ exa: '', tavily: 't', gemini: 'g' }, { exa: 'fallback-exa' });
      expect(keys.exaKey).to.equal('fallback-exa');
      expect(keys.tavilyKey).to.equal('t');
      expect(keys.openaiKey).to.equal('');
    });
  });

  describe('missingKeysMessage / invalidKeysMessage', () => {
    it('null when complete', () => {
      expect(missingKeysMessage(fullKeys)).to.be.null;
    });

    it('names the missing providers', () => {
      expect(missingKeysMessage({ ...fullKeys, exaKey: '', geminiKey: '' })).to.contain('Exa');
    });

    it('flags bad formats', () => {
      // 'e' is not a uuid → Exa invalid.
      expect(invalidKeysMessage(fullKeys)).to.contain('Exa');
    });

    it('returns structured missing-key details for the key dialog', async () => {
      const response = missingKeysResponse({ ...fullKeys, tavilyKey: '' });
      expect(response).to.not.be.null;
      expect(response?.status).to.equal(400);
      const body = await response?.json();
      expect(body.error.code).to.equal('MISSING_API_KEYS');
      expect(body.error.details.missingKeys).to.deep.include({
        provider: 'tavily',
        label: 'Tavily',
        envVar: 'SASTRAM_TAVILY_KEY',
      });
    });

    it('returns structured invalid-key details', async () => {
      const response = invalidKeysResponse(fullKeys);
      expect(response?.status).to.equal(400);
      const body = await response?.json();
      expect(body.error.code).to.equal('INVALID_API_KEYS');
      expect(body.error.details.invalidKeys[0].provider).to.equal('exa');
    });
  });

  describe('mapStreamError', () => {
    it('quota AISearchError maps to PROVIDER_QUOTA', () => {
      const mapped = mapStreamError(new AISearchError('over quota', 503));
      expect(mapped.errorCode).to.equal('PROVIDER_QUOTA');
    });

    it('429 message maps to a quota message', () => {
      expect(mapStreamError(new Error('429 RESOURCE_EXHAUSTED')).message).to.contain('quota');
    });
  });

  describe('mapTopLevelError', () => {
    it('AppError passes through with its own status', async () => {
      const res = mapTopLevelError(new AppError('bad query', 'VALIDATION_ERROR', 400));
      expect(res.status).to.equal(400);
      expect((await res.json()).error.code).to.equal('VALIDATION_ERROR');
    });

    it('unknown errors stay 500', async () => {
      const res = mapTopLevelError(new Error('kaboom'));
      expect(res.status).to.equal(500);
    });
  });
});
