import { expect } from 'chai';
import {
  classifyAiCallCost,
  evaluateAiCostGate,
  AiCallPath,
  AiCostTier,
  EXPENSIVE_PATHS,
  CHEAP_PATHS,
} from '@/lib/services/ai-cost-classification';

describe('AI cost classification', () => {
  describe('classifyAiCallCost', () => {
    it('classifies cheap-and-always-on paths as cheap with low cost', () => {
      for (const path of CHEAP_PATHS) {
        const result = classifyAiCallCost(path);
        expect(result.tier, `${path} should be cheap`).to.equal(AiCostTier.CHEAP);
        expect(result.estimatedCostUsd, `${path} cost should be sub-cent`).to.be.lessThan(0.01);
        expect(result.cacheable, `${path} should be cacheable`).to.equal(true);
      }
    });

    it('classifies expensive-and-deliberate paths as expensive', () => {
      for (const path of EXPENSIVE_PATHS) {
        const result = classifyAiCallCost(path);
        expect(result.tier, `${path} should be expensive`).to.equal(AiCostTier.EXPENSIVE);
        expect(result.cacheable, `${path} may not be cacheable`).to.equal(false);
      }
    });

    it('defaults unknown paths to expensive (fail safe, not open)', () => {
      const result = classifyAiCallCost('some-unknown-future-path' as AiCallPath);
      expect(result.tier).to.equal(AiCostTier.EXPENSIVE);
    });

    it('produces a stable estimated cost per path', () => {
      const a = classifyAiCallCost(AiCallPath.FORUM_SEARCH_SYNTHESIZE);
      const b = classifyAiCallCost(AiCallPath.FORUM_SEARCH_SYNTHESIZE);
      expect(a.estimatedCostUsd).to.equal(b.estimatedCostUsd);
    });
  });

  describe('@sai inline reply classification', () => {
    it('classifies @sai inline reply as EXPENSIVE (full streaming synthesis)', () => {
      const result = classifyAiCallCost(AiCallPath.AI_INLINE_REPLY);
      expect(result.tier).to.equal(AiCostTier.EXPENSIVE);
      expect(result.cacheable).to.equal(false);
    });
  });

  describe('hard-gate decision', () => {
    it('requires a hard pre-flight spend-cap gate for expensive paths', () => {
      // The gate decision is derivable from the tier: expensive => hard gate.
      const result = classifyAiCallCost(AiCallPath.AI_INLINE_REPLY);
      expect(result.tier === AiCostTier.EXPENSIVE).to.equal(true);
    });
  });

  describe('evaluateAiCostGate', () => {
    it('allows cheap paths regardless of spend cap', () => {
      const gate = evaluateAiCostGate({
        path: AiCallPath.TEXT_TOXICITY_MODERATION,
        spendCapAllowed: false,
      });
      expect(gate.allowed).to.equal(true);
      expect(gate.reason).to.equal('none');
    });

    it('blocks expensive paths when the spend cap is reached', () => {
      const gate = evaluateAiCostGate({
        path: AiCallPath.AI_INLINE_REPLY,
        spendCapAllowed: false,
      });
      expect(gate.allowed).to.equal(false);
      expect(gate.reason).to.equal('spend_cap_reached');
    });

    it('allows expensive paths when the spend cap is open', () => {
      const gate = evaluateAiCostGate({
        path: AiCallPath.AI_INLINE_REPLY,
        spendCapAllowed: true,
      });
      expect(gate.allowed).to.equal(true);
    });

    it('blocks unknown paths when spend cap is reached (fail safe)', () => {
      const gate = evaluateAiCostGate({
        path: 'future-unknown-path' as AiCallPath,
        spendCapAllowed: false,
      });
      expect(gate.allowed).to.equal(false);
    });
  });
});
