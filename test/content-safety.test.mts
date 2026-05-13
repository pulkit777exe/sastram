/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai';
import { containsBadLanguage, filterBadLanguage, validateFile, sanitizeUserContent } from '../lib/content-safety';

describe('Content Safety', () => {
  describe('Language Filter', () => {
    it('should detect bad language', () => {
      expect(containsBadLanguage('This is a scam message')).to.be.true;
      expect(containsBadLanguage('Hello world')).to.be.false;
    });

    it('should filter bad language', () => {
      const filtered = filterBadLanguage('This is a scam');
      expect(filtered).to.equal('This is a ****');
    });
  });

  describe('XSS Sanitization', () => {
    it('should remove script tags', () => {
      const result = sanitizeUserContent('<script>alert("xss")</script>Hello');
      expect(result.sanitized).to.not.include('<script>');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should remove javascript: URLs', () => {
      const result = sanitizeUserContent('<a href="javascript:alert(1)">click</a>');
      expect(result.sanitized).to.not.include('javascript:');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should remove inline event handlers', () => {
      const result = sanitizeUserContent('<img src=x onerror=alert(1)>');
      expect(result.sanitized).to.not.include('onerror');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should remove iframe elements', () => {
      const result = sanitizeUserContent('<iframe src="evil.com"></iframe>');
      expect(result.sanitized).to.not.include('<iframe');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should allow safe HTML tags', () => {
      const result = sanitizeUserContent('<p>Hello <strong>world</strong>!</p>');
      expect(result.sanitized).to.include('<strong>');
      expect(result.hadDangerousContent).to.be.false;
    });

    it('should allow safe links with https', () => {
      const result = sanitizeUserContent('<a href="https://example.com">Link</a>');
      expect(result.sanitized).to.include('https://example.com');
      expect(result.hadDangerousContent).to.be.false;
    });

    it('should convert data: URLs to span', () => {
      const result = sanitizeUserContent('<a href="data:text/html,<script>alert(1)</script>">click</a>');
      expect(result.sanitized).to.not.include('data:');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should remove SVG with onload', () => {
      const result = sanitizeUserContent('<svg onload="alert(1)"></svg>');
      expect(result.sanitized).to.not.include('onload');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should handle plain text without issues', () => {
      const result = sanitizeUserContent('Hello world! This is a plain message.');
      expect(result.sanitized).to.equal('Hello world! This is a plain message.');
      expect(result.hadDangerousContent).to.be.false;
    });
  });

  describe('File Validation', () => {
    it('should validate correct file types', () => {
      const file = new File(['content'], 'test.png', { type: 'image/png' });
      const result = validateFile(file);
      expect(result.isValid).to.be.true;
    });

    it('should reject large files', () => {
      const largeFile = {
        name: 'large.png',
        type: 'image/png',
        size: 10 * 1024 * 1024, // only 10mb as standard
      } as File;
      const result = validateFile(largeFile);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('5MB');
    });

    it('should reject malware filenames', () => {
      const malwareFile = new File([''], 'virus.png', { type: 'image/png' });
      const result = validateFile(malwareFile);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Malware detected');
    });
  });
});
