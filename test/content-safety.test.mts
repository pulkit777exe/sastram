import { describe, it } from 'mocha';
import { expect } from 'chai';
import { sanitizeUserContent, validateFile } from '@/lib/services/content-safety';

describe('Content Safety', () => {
  describe('sanitizeUserContent', () => {
    it('should strip script tags', () => {
      const result = sanitizeUserContent('<script>alert("xss")</script>Hello');
      expect(result.sanitized).to.not.include('<script>');
      expect(result.hadDangerousContent).to.be.true;
    });

    it('should allow safe HTML tags', () => {
      const result = sanitizeUserContent('<b>Bold</b> and <i>italic</i>');
      expect(result.sanitized).to.include('<b>');
      expect(result.sanitized).to.include('<i>');
      expect(result.hadDangerousContent).to.be.false;
    });

    it('should strip event handlers', () => {
      const result = sanitizeUserContent('<div onclick="alert(1)">Click</div>');
      expect(result.sanitized).to.not.include('onclick');
    });
  });

  describe('validateFile', () => {
    it('should reject files exceeding size limit', () => {
      const file = new File(['x'.repeat(5 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
      const result = validateFile(file);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('4.5MB');
    });

    it('should reject invalid file types', () => {
      const file = new File(['x'], 'test.exe', { type: 'application/x-executable' });
      const result = validateFile(file);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid file type');
    });

    it('should accept valid file types', () => {
      const file = new File(['x'], 'image.png', { type: 'image/png' });
      const result = validateFile(file);
      expect(result.isValid).to.be.true;
    });
  });
});
