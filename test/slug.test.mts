import { describe, it } from 'mocha';
import { expect } from 'chai';
import { slugify, buildThreadSlug, buildCommunitySlug } from '../lib/utils/slug';

describe('Slug Utilities', () => {
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

    it('should handle multiple consecutive special chars', () => {
      expect(slugify('hello...world')).to.equal('hello-world');
    });

    it('should remove leading hyphens', () => {
      expect(slugify('!hello')).to.equal('hello');
    });

    it('should remove trailing hyphens', () => {
      expect(slugify('hello!')).to.equal('hello');
    });

    it('should handle numbers', () => {
      expect(slugify('Test 123')).to.equal('test-123');
    });

    it('should handle empty string', () => {
      expect(slugify('')).to.equal('');
    });

    it('should handle unicode characters', () => {
      expect(slugify('Hello 世界')).to.equal('hello-世界');
    });
  });

  describe('buildThreadSlug', () => {
    it('should slugify title and append id', () => {
      const slug = buildThreadSlug('My Thread', 'abc123');
      expect(slug).to.equal('my-thread-abc123');
    });

    it('should generate UUID if no id provided', () => {
      const slug = buildThreadSlug('My Thread');
      expect(slug).to.match(/^my-thread-[a-f0-9-]{36}$/);
    });
  });

  describe('buildCommunitySlug', () => {
    it('should slugify title and append UUID', () => {
      const slug = buildCommunitySlug('My Community');
      expect(slug).to.match(/^my-community-[a-f0-9-]{36}$/);
    });
  });
});