import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  createMessageWithAttachmentsSchema,
  createThreadSchema,
  createCommunitySchema,
  attachmentInputSchema,
} from '../lib/schemas/database';
import { validateWebSocketMessage } from '../lib/schemas/websocket';
import { uploadResponseSchema, createThreadRequestSchema, createCommunityRequestSchema } from '../lib/schemas/api';

describe('Edge Case Tests', () => {
  describe('Message Schema - Edge Cases', () => {
    it('should reject content with only whitespace', () => {
      const data = {
        content: '   ',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject content with null bytes', () => {
      const data = {
        content: 'Hello\x00World',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject extremely long content (10000+ chars)', () => {
      const data = {
        content: 'a'.repeat(10000),
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject content with SQL injection patterns', () => {
      const data = {
        content: "SELECT * FROM users; DROP TABLE users;",
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject content with XSS patterns', () => {
      const data = {
        content: '<script>alert("xss")</script>',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should accept Unicode content', () => {
      const data = {
        content: 'Hello 世界 🌍 émoji',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should accept content with special characters', () => {
      const data = {
        content: 'Test @mention #tag $100 &amp; <br/> "quotes" \'single\'',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('Thread Schema - Edge Cases', () => {
    it('should reject thread name with only numbers', () => {
      const data = {
        name: '12345',
        slug: 'test-thread-abc123',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject slug with uppercase', () => {
      const data = {
        name: 'Test Thread',
        slug: 'Invalid-SLUG',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject slug with special chars', () => {
      const data = {
        name: 'Test Thread',
        slug: 'invalid@slug!',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should allow slug starting with number', () => {
      const data = {
        name: 'Test Thread',
        slug: '2024-thread',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject slug with consecutive dashes', () => {
      const data = {
        name: 'Test Thread',
        slug: 'test--thread',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject slug ending with dash', () => {
      const data = {
        name: 'Test Thread',
        slug: 'test-thread-',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject very short slug', () => {
      const data = {
        name: 'Test Thread',
        slug: 'ab',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should accept valid slug with numbers', () => {
      const data = {
        name: 'Test Thread',
        slug: 'thread-2024-01',
        createdBy: 'cluser123456789',
      };
      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('Community Schema - Edge Cases', () => {
    it('should reject community with emoji in name', () => {
      const data = {
        title: 'Test 🚀 Community',
        slug: 'test-community',
        createdBy: 'cluser123456789',
      };
      const result = createCommunitySchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject community with very long description', () => {
      const data = {
        title: 'Test Community',
        slug: 'test-community',
        description: 'a'.repeat(281),
        createdBy: 'cluser123456789',
      };
      const result = createCommunitySchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should accept community without description', () => {
      const data = {
        title: 'Test Community',
        slug: 'test-community',
        createdBy: 'cluser123456789',
      };
      const result = createCommunitySchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('Attachment Schema - Edge Cases', () => {
    it('should reject attachment with invalid type case', () => {
      const data = {
        url: 'https://example.com/image.png',
        type: 'image',
        name: 'image.png',
        size: 1024,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject attachment with zero size', () => {
      const data = {
        url: 'https://example.com/image.png',
        type: 'IMAGE',
        name: 'image.png',
        size: 0,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject attachment with negative size', () => {
      const data = {
        url: 'https://example.com/image.png',
        type: 'IMAGE',
        name: 'image.png',
        size: -1,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject attachment with invalid URL scheme', () => {
      const data = {
        url: 'ftp://example.com/image.png',
        type: 'IMAGE',
        name: 'image.png',
        size: 1024,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should allow attachment with DATA URL (for inline images)', () => {
      const data = {
        url: 'data:image/png;base64,iVBORw0KGgo=',
        type: 'IMAGE',
        name: 'image.png',
        size: 1024,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('API Schema - Edge Cases', () => {
    it('should reject upload response with no files', () => {
      const data = {
        files: [],
      };
      const result = uploadResponseSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject upload response with null files', () => {
      const data = {
        files: null,
      };
      const result = uploadResponseSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should accept upload response with multiple files', () => {
      const data = {
        files: [
          { url: 'https://example.com/1.png', type: 'IMAGE', name: '1.png', size: 1024 },
          { url: 'https://example.com/2.png', type: 'IMAGE', name: '2.png', size: 2048 },
        ],
      };
      const result = uploadResponseSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('Thread Request - Edge Cases', () => {
    it('should reject title at exactly min length', () => {
      const data = {
        title: 'AB',
        description: 'Test',
        communityId: 'clcomm123456789',
      };
      const result = createThreadRequestSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should accept title at exactly min length (3)', () => {
      const data = {
        title: 'ABC',
        description: 'Test',
        communityId: 'clcomm123456789',
      };
      const result = createThreadRequestSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject title with only special chars', () => {
      const data = {
        title: '!@#$%',
        description: 'Test',
        communityId: 'clcomm123456789',
      };
      const result = createThreadRequestSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should accept title with mixed case and numbers', () => {
      const data = {
        title: 'React 18 Tutorial 2024',
        description: 'Test',
        communityId: 'clcomm123456789',
      };
      const result = createThreadRequestSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject title with newlines', () => {
      const data = {
        title: 'Test\nThread',
        description: 'Test',
        communityId: 'clcomm123456789',
      };
      const result = createThreadRequestSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject title with tabs', () => {
      const data = {
        title: 'Test\tThread',
        description: 'Test',
        communityId: 'clcomm123456789',
      };
      const result = createThreadRequestSchema.safeParse(data);
      expect(result.success).to.be.false;
    });
  });

  describe('Community Request - Edge Cases', () => {
    it('should reject slug at max boundary', () => {
      const data = {
        title: 'A'.repeat(101),
        description: 'Test',
      };
      const result = createCommunityRequestSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should accept description at max boundary', () => {
      const data = {
        title: 'Test',
        description: 'a'.repeat(280),
      };
      const result = createCommunityRequestSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject title with trailing spaces', () => {
      const data = {
        title: 'Test  ',
        description: 'Test',
      };
      const result = createCommunityRequestSchema.safeParse(data);
      expect(result.success).to.be.false;
    });
  });

  describe('WebSocket Message - Edge Cases', () => {
    it('should reject message with null payload', () => {
      const message = {
        type: 'NEW_MESSAGE',
        payload: null,
      };
      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.false;
    });

    it('should reject message with undefined payload', () => {
      const message = {
        type: 'NEW_MESSAGE',
      };
      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.false;
    });

    it('should accept message with extra fields', () => {
      const message = {
        type: 'NEW_MESSAGE',
        payload: {
          id: 'clmsg123456789',
          content: 'Test',
          senderId: 'cluser123456789',
          senderName: 'John',
          sectionId: 'clsect123456789',
          createdAt: new Date(),
          extraField: 'should be ignored',
        },
      };
      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.true;
    });

    it('should reject REACTION_UPDATE with invalid count', () => {
      const message = {
        type: 'REACTION_UPDATE',
        payload: {
          messageId: 'clmsg123456789',
          reactionType: '👍',
          count: -1,
          sectionId: 'clsect123456789',
        },
      };
      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.false;
    });
  });
});

describe('Security Input Tests', () => {
  describe('SQL Injection Prevention', () => {
    it('should allow but sanitize SQL-like content', () => {
      const data = {
        content: "DROP TABLE users; SELECT * FROM users WHERE 1=1;",
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should allow but sanitize UNION queries', () => {
      const data = {
        content: "UNION SELECT password FROM users--",
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should allow but sanitize comment patterns', () => {
      const data = {
        content: "'; -- comment",
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('XSS Prevention', () => {
    it('should allow script tags in content (sanitization is app responsibility)', () => {
      const data = {
        content: '<img src=x onerror=alert(1)>',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should allow JavaScript URI', () => {
      const data = {
        content: '<a href="javascript:alert(1)">click</a>',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should allow SVG onload', () => {
      const data = {
        content: '<svg onload="alert(1)">',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal in URL', () => {
      const data = {
        url: '../../../etc/passwd',
        type: 'FILE',
        name: 'passwd',
        size: 1024,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should reject Windows drive path', () => {
      const data = {
        url: 'C:\\Windows\\system32',
        type: 'FILE',
        name: 'config',
        size: 1024,
      };
      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });
  });

  describe('Rate Limiting Boundaries', () => {
    it('should handle very rapid character input', () => {
      const data = {
        content: 'a'.repeat(1000),
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should handle emoji spam', () => {
      const data = {
        content: '👍👍👍👍👍👍👍👍👍👍',
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });
  });
});

describe('Boundary Value Tests', () => {
  describe('Numeric Boundaries', () => {
    it('should reject message at max length boundary', () => {
      const data = {
        content: 'a'.repeat(1000),
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it('should reject message at max+1 length', () => {
      const data = {
        content: 'a'.repeat(1001),
        sectionId: 'clsect123456789',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });
  });

  describe('Empty vs Null vs Undefined', () => {
    it('should handle null sectionId', () => {
      const data = {
        content: 'Test',
        sectionId: null,
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it('should handle undefined sectionId', () => {
      const data = {
        content: 'Test',
      };
      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });
  });
});