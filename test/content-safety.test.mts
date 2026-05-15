import { describe, it } from 'mocha';
import { expect } from 'chai';
import { containsBadLanguage, filterBadLanguage } from '../lib/services/content-safety';

describe('Content Safety', () => {
  describe('containsBadLanguage', () => {
    it('should detect bad words in content', () => {
      expect(containsBadLanguage('This is a scam message')).to.be.true;
      expect(containsBadLanguage('Click here for malware')).to.be.true;
    });

    it('should be case insensitive', () => {
      expect(containsBadLanguage('SCAM alert')).to.be.true;
      expect(containsBadLanguage('Phishing attempt')).to.be.true;
    });

    it('should return false for clean content', () => {
      expect(containsBadLanguage('Hello world')).to.be.false;
      expect(containsBadLanguage('Welcome to the forum')).to.be.false;
    });
  });

  describe('filterBadLanguage', () => {
    it('should replace bad words with asterisks', () => {
      expect(filterBadLanguage('This is a scam')).to.equal('This is a ****');
    });

    it('should replace multiple bad words', () => {
      expect(filterBadLanguage('scam and malware')).to.equal('**** and *******');
    });

    it('should preserve clean content', () => {
      expect(filterBadLanguage('Hello world')).to.equal('Hello world');
    });
  });
});
