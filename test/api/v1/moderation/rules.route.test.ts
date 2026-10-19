import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import type sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../../helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';

describe('Moderation Rules', () => {
  describe('validateRegexPattern (unit tests)', () => {
    const { validateRegexPattern } = require('@/app/api/v1/moderation/rules/route');

    it('accepts simple patterns', () => {
      const result = validateRegexPattern('spam');
      expect(result.valid).to.equal(true);
    });

    it('rejects patterns that are too long', () => {
      const longPattern = 'a'.repeat(201);
      const result = validateRegexPattern(longPattern);
      expect(result.valid).to.equal(false);
      expect(result.error).to.include('too long');
    });

    it('rejects invalid regex syntax', () => {
      const result = validateRegexPattern('[invalid');
      expect(result.valid).to.equal(false);
      expect(result.error).to.include('Invalid regex');
    });

    it('rejects deeply nested groups', () => {
      const result = validateRegexPattern('(((((a)+)+)+)+)+');
      expect(result.valid).to.equal(false);
      expect(result.error).to.include('nested groups');
    });

    it('rejects too many backreferences', () => {
      const result = validateRegexPattern('(a)\\1\\2\\3');
      expect(result.valid).to.equal(false);
      expect(result.error).to.include('backreferences');
    });

    it('rejects nested quantifiers on groups', () => {
      const result = validateRegexPattern('(a+)+');
      expect(result.valid).to.equal(false);
      expect(result.error).to.include('Nested quantifiers');
    });

    it('accepts patterns with up to 4 levels of nesting', () => {
      const result = validateRegexPattern('((((a)+))+)+');
      expect(result.valid).to.equal(true);
    });
  });

  describe('PUT/DELETE Prisma error mapping (live consumer of handleError)', () => {
    let stubs: sinon.SinonStub[] = [];

    afterEach(() => {
      restoreStubs(...stubs);
      stubs = [];
    });

    function installAdminSession() {
      stubs.push(stubHeaders());
      stubs.push(...stubAuth({ user: { role: 'ADMIN', status: 'ACTIVE' } }));
    }

    it('returns 404 NOT_FOUND (not 409) when PUT targets a missing rule', async () => {
      installAdminSession();
      const restorePrisma = installFakePrisma({
        'moderationRule.update': async () => {
          throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        },
      });

      try {
        const { PUT } = require('@/app/api/v1/moderation/rules/route');
        const res = await PUT(mockRequest('/api/v1/moderation/rules', { method: 'PUT', body: { id: 'missing-rule' } }));
        const body = await res.json();

        expect(res.status).to.equal(404);
        expect(body.error?.code).to.equal('NOT_FOUND');
        expect(body.error?.message).to.equal('Record not found');
      } finally {
        restorePrisma();
      }
    });

    it('returns 404 NOT_FOUND (not 409) when DELETE targets a missing rule', async () => {
      installAdminSession();
      const restorePrisma = installFakePrisma({
        'moderationRule.delete': async () => {
          throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
        },
      });

      try {
        const { DELETE } = require('@/app/api/v1/moderation/rules/route');
        const res = await DELETE(mockRequest('/api/v1/moderation/rules', { method: 'DELETE', body: { id: 'missing-rule' } }));
        const body = await res.json();

        expect(res.status).to.equal(404);
        expect(body.error?.code).to.equal('NOT_FOUND');
      } finally {
        restorePrisma();
      }
    });
  });
});
