import { describe, it, afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { logger } from '@/lib/infrastructure/logger';

describe('Auth Service', function () {
  describe('Configuration', function () {
    it('should export auth object', async function () {
      const { auth } = await import('@/lib/services/auth');
      expect(auth).to.exist;
    });

    it('should have emailAndPassword configured', async function () {
      const { auth } = await import('@/lib/services/auth');
      expect(auth.options.emailAndPassword).to.exist;
      expect(auth.options.emailAndPassword.enabled).to.equal(true);
    });

    it('should have baseURL configured', async function () {
      const { auth } = await import('@/lib/services/auth');
      expect(auth.options.baseURL).to.be.a('string');
      expect(auth.options.baseURL).to.have.length.greaterThan(0);
    });

    it('should have secret configured', async function () {
      const { auth } = await import('@/lib/services/auth');
      expect(auth.options.secret).to.be.a('string');
      expect(auth.options.secret).to.have.length.greaterThanOrEqual(32);
    });
  });

  describe('Social Providers', function () {
    it('should configure social providers when env vars are set', async function () {
      const { auth } = await import('@/lib/services/auth');
      expect(auth.options.socialProviders).to.be.an('object');
    });

    it('should have google provider configured from env', async function () {
      const { auth } = await import('@/lib/services/auth');
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        expect(auth.options.socialProviders).to.have.property('google');
        expect(auth.options.socialProviders.google).to.have.property('clientId');
        expect(auth.options.socialProviders.google).to.have.property('clientSecret');
      }
    });

    it('should have github provider configured from env', async function () {
      const { auth } = await import('@/lib/services/auth');
      if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        expect(auth.options.socialProviders).to.have.property('github');
        expect(auth.options.socialProviders.github).to.have.property('clientId');
        expect(auth.options.socialProviders.github).to.have.property('clientSecret');
      }
    });

    it('should validate google provider requires both id and secret', function () {
      const originalId = process.env.GOOGLE_CLIENT_ID;
      const originalSecret = process.env.GOOGLE_CLIENT_SECRET;

      process.env.GOOGLE_CLIENT_ID = 'test-only-id';
      delete process.env.GOOGLE_CLIENT_SECRET;

      const envPath = require.resolve('@/lib/config/env');
      const authPath = require.resolve('@/lib/services/auth');
      delete require.cache[envPath];
      delete require.cache[authPath];

      try {
        expect(() => require('@/lib/services/auth')).to.throw(
          'Google OAuth requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
        );
      } finally {
        if (originalId !== undefined) {
          process.env.GOOGLE_CLIENT_ID = originalId;
        } else {
          delete process.env.GOOGLE_CLIENT_ID;
        }
        if (originalSecret !== undefined) {
          process.env.GOOGLE_CLIENT_SECRET = originalSecret;
        } else {
          delete process.env.GOOGLE_CLIENT_SECRET;
        }
        delete require.cache[envPath];
        delete require.cache[authPath];
      }
    });

    it('should validate github provider requires both id and secret', function () {
      const originalId = process.env.GITHUB_CLIENT_ID;
      const originalSecret = process.env.GITHUB_CLIENT_SECRET;

      process.env.GITHUB_CLIENT_ID = 'test-only-id';
      delete process.env.GITHUB_CLIENT_SECRET;

      const envPath = require.resolve('@/lib/config/env');
      const authPath = require.resolve('@/lib/services/auth');
      delete require.cache[envPath];
      delete require.cache[authPath];

      try {
        expect(() => require('@/lib/services/auth')).to.throw(
          'GitHub OAuth requires both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET'
        );
      } finally {
        if (originalId !== undefined) {
          process.env.GITHUB_CLIENT_ID = originalId;
        } else {
          delete process.env.GITHUB_CLIENT_ID;
        }
        if (originalSecret !== undefined) {
          process.env.GITHUB_CLIENT_SECRET = originalSecret;
        } else {
          delete process.env.GITHUB_CLIENT_SECRET;
        }
        delete require.cache[envPath];
        delete require.cache[authPath];
      }
    });
  });

  describe('OTP Logging Behavior', function () {
    let infoStub: sinon.SinonStub;

    this.timeout(10000);

    beforeEach(function () {
      infoStub = sinon.stub(logger, 'info');
    });

    afterEach(function () {
      infoStub.restore();
    });

    it('should log OTP in development mode', async function () {
      const originalEnv = process.env.NODE_ENV;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.env as any).NODE_ENV = 'development';

      try {
        const { auth } = await import('@/lib/services/auth');
        const otpPlugin = auth.options.plugins?.find(
          (p: Record<string, unknown>) => p.id === 'email-otp'
        );

        if (otpPlugin && typeof otpPlugin === 'object' && 'options' in otpPlugin) {
          const opts = otpPlugin.options as Record<string, unknown>;
          if (typeof opts.sendVerificationOTP === 'function') {
            await opts.sendVerificationOTP({
              email: 'test@example.com',
              otp: '123456',
              type: 'sign-in',
            });

            expect(infoStub.calledWithMatch(/\[DEV\].*123456/)).to.equal(true);
          }
        }
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (process.env as any).NODE_ENV = originalEnv;
      }
    });

    it('should not log OTP in production mode', async function () {
      const originalEnv = process.env.NODE_ENV;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.env as any).NODE_ENV = 'production';

      try {
        const { auth } = await import('@/lib/services/auth');
        const otpPlugin = auth.options.plugins?.find(
          (p: Record<string, unknown>) => p.id === 'email-otp'
        );

        if (otpPlugin && typeof otpPlugin === 'object' && 'options' in otpPlugin) {
          const opts = otpPlugin.options as Record<string, unknown>;
          if (typeof opts.sendVerificationOTP === 'function') {
            await opts.sendVerificationOTP({
              email: 'test@example.com',
              otp: '654321',
              type: 'sign-in',
            });

            expect(infoStub.calledWithMatch(/\[DEV\].*654321/)).to.equal(false);
          }
        }
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (process.env as any).NODE_ENV = originalEnv;
      }
    });
  });
});

describe('Auth Route', function () {
  it('should export GET handler', async function () {
    const route = await import('@/app/api/auth/[...all]/route');
    expect(route.GET).to.be.a('function');
  });

  it('should export POST handler', async function () {
    const route = await import('@/app/api/auth/[...all]/route');
    expect(route.POST).to.be.a('function');
  });
});
