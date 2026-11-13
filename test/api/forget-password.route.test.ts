import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { NextRequest } from 'next/server';
import { APIError } from 'better-auth';
import { mockRequest, restoreStubs } from './helpers';

type AuthApi = typeof import('@/lib/services/auth').auth.api;

const requestResetRoute = () => require('@/app/api/forget-password/email-otp/route').POST;
const resetPasswordRoute = () => require('@/app/api/email-otp/reset-otp/route').POST;

function malformedJsonRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
}

describe('Password reset API wrappers', () => {
  let authApi: AuthApi;
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    const { auth } = require('@/lib/services/auth');
    authApi = auth.api;
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  describe('POST /api/forget-password/email-otp', () => {
    it('rejects malformed JSON', async () => {
      const res = await requestResetRoute()(
        malformedJsonRequest('/api/forget-password/email-otp')
      );
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      expect(body.error?.message).to.equal('Invalid JSON body');
    });

    it('rejects an invalid email before calling Better Auth', async () => {
      const request = sinon.stub(authApi, 'requestPasswordResetEmailOTP');
      stubs.push(request);

      const res = await requestResetRoute()(
        mockRequest('/api/forget-password/email-otp', {
          method: 'POST',
          body: { email: 'not-an-email' },
        })
      );
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      expect(body.error?.message).to.equal('Invalid email address');
      expect(request.called).to.equal(false);
    });

    it('delegates to Better Auth requestPasswordResetEmailOTP', async () => {
      const request = sinon
        .stub(authApi, 'requestPasswordResetEmailOTP')
        .resolves({ success: true });
      stubs.push(request);

      const res = await requestResetRoute()(
        mockRequest('/api/forget-password/email-otp', {
          method: 'POST',
          body: { email: 'user@example.com' },
        })
      );
      const body = await res.json();

      expect(res.status).to.equal(200);
      expect(body.data).to.deep.equal({ success: true });
      expect(request.calledOnce).to.equal(true);
      expect(request.firstCall.args[0]).to.deep.include({
        body: { email: 'user@example.com' },
      });
    });

    it('maps Better Auth client errors to a generic 400', async () => {
      const request = sinon
        .stub(authApi, 'requestPasswordResetEmailOTP')
        .rejects(new APIError(400, { message: 'raw provider detail' }));
      stubs.push(request);

      const res = await requestResetRoute()(
        mockRequest('/api/forget-password/email-otp', {
          method: 'POST',
          body: { email: 'user@example.com' },
        })
      );
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('INTERNAL_ERROR');
      expect(body.error?.message).to.equal('Failed to send reset code');
    });
  });

  describe('POST /api/email-otp/reset-otp', () => {
    it('rejects malformed JSON', async () => {
      const res = await resetPasswordRoute()(
        malformedJsonRequest('/api/email-otp/reset-otp')
      );
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      expect(body.error?.message).to.equal('Invalid JSON body');
    });

    it('rejects incomplete reset payloads before calling Better Auth', async () => {
      const reset = sinon.stub(authApi, 'resetPasswordEmailOTP');
      stubs.push(reset);

      const res = await resetPasswordRoute()(
        mockRequest('/api/email-otp/reset-otp', {
          method: 'POST',
          body: { email: 'user@example.com', otp: '', password: 'short' },
        })
      );
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      expect(body.error?.message).to.equal(
        'Email, OTP, and password are required'
      );
      expect(reset.called).to.equal(false);
    });

    it('delegates to Better Auth and forwards session cookies', async () => {
      const headers = new Headers();
      headers.append(
        'set-cookie',
        'better-auth.session_token=abc; Path=/; HttpOnly'
      );
      const reset = sinon.stub(authApi, 'resetPasswordEmailOTP').resolves({
        response: { success: true },
        headers,
      } as unknown as { success: boolean });
      stubs.push(reset);

      const res = await resetPasswordRoute()(
        mockRequest('/api/email-otp/reset-otp', {
          method: 'POST',
          body: {
            email: 'user@example.com',
            otp: '123456',
            password: 'long-enough-password',
          },
        })
      );
      const body = await res.json();

      expect(res.status).to.equal(200);
      expect(body.data).to.deep.equal({ success: true });
      expect(res.headers.get('set-cookie')).to.contain(
        'better-auth.session_token=abc'
      );
      expect(reset.calledOnce).to.equal(true);
    });

    it('maps Better Auth client errors to a generic 400', async () => {
      const reset = sinon
        .stub(authApi, 'resetPasswordEmailOTP')
        .rejects(new APIError(400, { message: 'invalid otp' }));
      stubs.push(reset);

      const res = await resetPasswordRoute()(
        mockRequest('/api/email-otp/reset-otp', {
          method: 'POST',
          body: {
            email: 'user@example.com',
            otp: '123456',
            password: 'long-enough-password',
          },
        })
      );
      const body = await res.json();

      expect(res.status).to.equal(400);
      expect(body.error?.code).to.equal('VALIDATION_ERROR');
      expect(body.error?.message).to.equal('Password reset failed');
    });
  });
});
