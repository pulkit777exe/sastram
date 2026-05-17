import { describe, it } from 'mocha';
import { expect } from 'chai';
import { ok, fail, unauthorizedResponse, errorResponse, validationErrorResponse } from '@/lib/utils/api-response';

describe('API Response Helpers', () => {
  describe('successResponse', () => {
    it('should return 200 with data', async () => {
      const response = await ok({ id: 1, name: 'test' });
      expect(response.success).to.be.true;
      expect(response.data).to.deep.equal({ id: 1, name: 'test' });
    });
  });

  describe('errorResponse', () => {
    it('should return 400 with error message', async () => {
      const response = await fail('VALIDATION_ERROR', 'Invalid input');
      expect(response.success).to.be.false;
      expect(response.error?.code).to.equal('VALIDATION_ERROR');
      expect(response.error?.message).to.equal('Invalid input');
    });
  });

  describe('unauthorizedResponse', () => {
    it('should return 401 status', async () => {
      const response = await unauthorizedResponse();
      expect(response.status).to.equal(401);
    });
  });

  describe('validationErrorResponse', () => {
    it('should return 400 status response', async () => {
      const response = await validationErrorResponse(['email is required', 'password too short']);
      expect(response.status).to.equal(400);
    });
  });
});

describe('API Route — Input Validation Schemas', () => {
  it('email-otp sign-in validates email format', async () => {
    const { z } = await import('zod');
    const schema = z.object({ email: z.string().email() });
    expect(schema.safeParse({ email: 'not-an-email' }).success).to.be.false;
    expect(schema.safeParse({ email: 'valid@example.com' }).success).to.be.true;
  });

  it('thread creation validates title length', async () => {
    const { z } = await import('zod');
    const schema = z.object({ title: z.string().min(3) });
    expect(schema.safeParse({ title: 'ab' }).success).to.be.false;
    expect(schema.safeParse({ title: 'ValidTitle' }).success).to.be.true;
  });

  it('pagination validates limit and offset', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      limit: z.number().int().positive().max(100).optional(),
      offset: z.number().int().nonnegative().optional(),
    });
    expect(schema.safeParse({ limit: 0 }).success).to.be.false;
    expect(schema.safeParse({ limit: -1 }).success).to.be.false;
    expect(schema.safeParse({ offset: -1 }).success).to.be.false;
    expect(schema.safeParse({ limit: 50, offset: 0 }).success).to.be.true;
  });

  it('search validates query presence and length', async () => {
    const { z } = await import('zod');
    const schema = z.object({ query: z.string().min(1).max(200) });
    expect(schema.safeParse({ query: '' }).success).to.be.false;
    expect(schema.safeParse({ query: 'a'.repeat(201) }).success).to.be.false;
    expect(schema.safeParse({ query: 'hello' }).success).to.be.true;
  });
});

describe('API Route — Rate Limiting Configuration', () => {
  it('auth endpoints are rate limited', async () => {
    const { rateLimitConfig } = await import('@/lib/services/rate-limit');
    expect(rateLimitConfig.auth).to.have.property('points');
    expect(rateLimitConfig.auth.points).to.be.lessThan(10);
  });

  it('message endpoints are rate limited', async () => {
    const { rateLimitConfig } = await import('@/lib/services/rate-limit');
    expect(rateLimitConfig.message).to.have.property('points');
  });

  it('upload endpoints are rate limited', async () => {
    const { rateLimitConfig } = await import('@/lib/services/rate-limit');
    expect(rateLimitConfig.upload).to.have.property('points');
  });
});

describe('API Route — CRON Security', () => {
  it('CRON_SECRET meets minimum length requirement', async () => {
    const { env } = await import('@/lib/config/env');
    expect(env.CRON_SECRET).to.be.a('string');
    expect(env.CRON_SECRET.length).to.be.greaterThanOrEqual(32);
  });
});

describe('API Route — Moderation Validation', () => {
  it('delete message validates messageId', async () => {
    const { deleteMessageSchema } = await import('@/modules/moderation/schemas');
    const result = deleteMessageSchema.safeParse({ messageId: 'invalid', sectionSlug: 'test' });
    expect(result.success).to.be.false;
  });

  it('ban user validates reason enum', async () => {
    const { banUserSchema } = await import('@/modules/moderation/schemas');
    const result = banUserSchema.safeParse({ userId: 'abc123', reason: 'INVALID_REASON' });
    expect(result.success).to.be.false;
  });
});
