import { describe, it } from 'mocha';
import { expect } from 'chai';
import { validateRegexPattern } from '@/app/api/v1/moderation/rules/route';

describe('Moderation Regex Validation', () => {
  describe('validateRegexPattern', () => {
    it('should accept simple patterns', () => {
      const result = validateRegexPattern('hello');
      expect(result.valid).to.be.true;
    });

    it('should accept patterns with simple quantifiers', () => {
      const result = validateRegexPattern('a+b*c?');
      expect(result.valid).to.be.true;
    });

    it('should reject invalid regex syntax', () => {
      const result = validateRegexPattern('[invalid');
      expect(result.valid).to.be.false;
      expect(result.error).to.include('Invalid regex');
    });

    it('should reject patterns that are too long', () => {
      const longPattern = 'a'.repeat(201);
      const result = validateRegexPattern(longPattern);
      expect(result.valid).to.be.false;
      expect(result.error).to.include('too long');
    });

    it('should reject deeply nested groups', () => {
      const result = validateRegexPattern('((((()))))');
      expect(result.valid).to.be.false;
      expect(result.error).to.include('nested groups');
    });

    it('should reject nested quantifiers on groups', () => {
      const result = validateRegexPattern('(a+)+');
      expect(result.valid).to.be.false;
      expect(result.error).to.include('Nested quantifiers');
    });

    it('should reject too many backreferences', () => {
      const result = validateRegexPattern('(a)(b)(c)\\1\\2\\3');
      expect(result.valid).to.be.false;
      expect(result.error).to.include('backreferences');
    });

    it('should accept patterns with up to 4 levels of nesting', () => {
      const result = validateRegexPattern('((ab))');
      expect(result.valid).to.be.true;
    });
  });
});
