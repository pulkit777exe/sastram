import { describe, it } from 'mocha';
import { expect } from 'chai';
import { slugify } from '@/lib/utils/slug';

describe('Slug Utility', () => {
  describe('slugify', () => {
    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).to.equal('hello-world');
    });

    it('should trim whitespace', () => {
      expect(slugify('  hello  ')).to.equal('hello');
    });

    it('should replace spaces with hyphens', () => {
      expect(slugify('hello world test')).to.equal('hello-world-test');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello @World!')).to.equal('hello-world');
    });

    it('should handle empty strings', () => {
      expect(slugify('')).to.equal('');
    });

    it('should handle consecutive special characters', () => {
      expect(slugify('hello---world')).to.equal('hello-world');
    });

    it('should handle mixed case with numbers', () => {
      expect(slugify('Thread 123 Title')).to.equal('thread-123-title');
    });

    it('should handle leading/trailing hyphens', () => {
      expect(slugify('-hello-')).to.equal('hello');
    });
  });
});
