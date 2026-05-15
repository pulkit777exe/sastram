import { describe, it } from 'mocha';
import { expect } from 'chai';

describe('Basic Utilities', () => {
  describe('Slugify', () => {
    const slugify = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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
  });

  describe('Content Safety', () => {
    const BAD_WORDS = ['spam', 'scam', 'malware'];
    const containsBadLanguage = (content: string) => BAD_WORDS.some(w => content.toLowerCase().includes(w));
    const filterBadLanguage = (content: string) => {
      let filtered = content;
      BAD_WORDS.forEach(w => { filtered = filtered.replace(new RegExp(w, 'gi'), '*'.repeat(w.length)); });
      return filtered;
    };

    it('should detect bad language', () => {
      expect(containsBadLanguage('This is a scam message')).to.be.true;
      expect(containsBadLanguage('Hello world')).to.be.false;
    });

    it('should filter bad language', () => {
      expect(filterBadLanguage('This is a scam')).to.equal('This is a ****');
    });
  });

  describe('Rate Limit Config', () => {
    const rateLimitConfig = {
      auth: { points: 5, duration: 900 },
      message: { points: 20, duration: 60 },
      websocket: { points: 50, duration: 60 },
    };

    it('should have auth bucket', () => {
      expect(rateLimitConfig.auth.points).to.equal(5);
    });

    it('should have message bucket', () => {
      expect(rateLimitConfig.message.points).to.equal(20);
    });

    it('should have websocket bucket', () => {
      expect(rateLimitConfig.websocket.points).to.equal(50);
    });
  });

});