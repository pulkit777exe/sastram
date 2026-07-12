import { describe, it } from 'mocha';
import { expect } from 'chai';
import { isAiNotConfigured, AI_NOT_CONFIGURED_SENTINEL } from '@/lib/services/ai-sentinel';

describe('AI Not Configured Sentinel', () => {
  describe('isAiNotConfigured', () => {
    it('should return true for the exact sentinel string', () => {
      expect(isAiNotConfigured(AI_NOT_CONFIGURED_SENTINEL)).to.be.true;
    });

    it('should return false for real AI-generated text', () => {
      expect(isAiNotConfigured('Here is a summary of the thread...')).to.be.false;
    });

    it('should return false for empty string', () => {
      expect(isAiNotConfigured('')).to.be.false;
    });

    it('should return false for sentinel with trailing whitespace', () => {
      expect(isAiNotConfigured(`${AI_NOT_CONFIGURED_SENTINEL} `)).to.be.false;
    });

    it('should return false for sentinel with trailing newline', () => {
      expect(isAiNotConfigured(`${AI_NOT_CONFIGURED_SENTINEL}\n`)).to.be.false;
    });

    it('should return false for sentinel with leading whitespace', () => {
      expect(isAiNotConfigured(` ${AI_NOT_CONFIGURED_SENTINEL}`)).to.be.false;
    });

    it('should return false for a partial sentinel match', () => {
      expect(isAiNotConfigured('__AI_NOT_CONFIGURED')).to.be.false;
      expect(isAiNotConfigured('AI_NOT_CONFIGURED__')).to.be.false;
    });

    it('should return false for sentinel embedded in longer text', () => {
      expect(isAiNotConfigured(`Prefix ${AI_NOT_CONFIGURED_SENTINEL} suffix`)).to.be.false;
    });
  });
});
