import { describe, it, afterEach, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { logger } from '@/lib/infrastructure/logger';
import { resetEnvCache } from '@/lib/config/env';

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
      // Reset the validated-env caches (instead of evicting env.ts from
      // require.cache, which forks a second module instance) so the
      // re-required auth module below validates fresh values.
      resetEnvCache();

      const authPath = require.resolve('@/lib/services/auth');
      delete require.cache[authPath];

      try {
        expect(() => require('@/lib/services/auth')).to.throw(
          /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together/
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
        resetEnvCache();
        delete require.cache[authPath];
      }
    });

    it('should validate github provider requires both id and secret', function () {
      const originalId = process.env.GITHUB_CLIENT_ID;
      const originalSecret = process.env.GITHUB_CLIENT_SECRET;

      process.env.GITHUB_CLIENT_ID = 'test-only-id';
      delete process.env.GITHUB_CLIENT_SECRET;
      // Reset the validated-env caches (instead of evicting env.ts from
      // require.cache, which forks a second module instance) so the
      // re-required auth module below validates fresh values.
      resetEnvCache();

      const authPath = require.resolve('@/lib/services/auth');
      delete require.cache[authPath];

      try {
        expect(() => require('@/lib/services/auth')).to.throw(
          /GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured together/
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
        resetEnvCache();
        delete require.cache[authPath];
      }
    });
  });

  describe('OTP Logging Behavior', function () {
    let infoStub: sinon.SinonStub;
    let debugStub: sinon.SinonStub;

    this.timeout(10000);

    beforeEach(function () {
      infoStub = sinon.stub(logger, 'info');
      debugStub = sinon.stub(logger, 'debug');
    });

    afterEach(function () {
      infoStub.restore();
      debugStub.restore();
    });

    it('should log masked OTP in development mode (never raw)', async function () {
      const originalEnv = process.env.NODE_ENV;

      (process.env as unknown as Record<string, string | undefined>).NODE_ENV = 'development';

      try {
        const { auth } = await import('@/lib/services/auth');
        const otpPlugin = auth.options.plugins?.find(
          (p: Record<string, unknown>) => p.id === 'email-otp'
        );

        if (otpPlugin && typeof otpPlugin === 'object' && 'options' in otpPlugin) {
          const opts = otpPlugin.options as Record<string, unknown>;
          if (typeof opts.sendVerificationOTP === 'function') {
            await (opts.sendVerificationOTP as (args: unknown) => Promise<void>)({
              email: 'test@example.com',
              otp: '123456',
              type: 'sign-in',
            });

            expect(infoStub.calledWithMatch(/123456/)).to.equal(false);
            expect(debugStub.calledWithMatch(/\*\*\*56/)).to.equal(true);
          }
        }
      } finally {
        // Assigning undefined would store the string "undefined" — delete instead.
        if (originalEnv === undefined) {
          delete (process.env as unknown as Record<string, string | undefined>).NODE_ENV;
        } else {
          (process.env as unknown as Record<string, string | undefined>).NODE_ENV = originalEnv;
        }
      }
    });

    it('should not log OTP in production mode', async function () {
      const mutableEnv = process.env as Record<string, string | undefined>;
      const originalEnv = mutableEnv.NODE_ENV;
      const originalQstashDev = mutableEnv.QSTASH_DEV;

      mutableEnv.NODE_ENV = 'production';
      // The real production validator rejects QSTASH_DEV; keep the simulated
      // production environment internally consistent.
      mutableEnv.QSTASH_DEV = 'false';

      try {
        const { auth } = await import('@/lib/services/auth');
        const otpPlugin = auth.options.plugins?.find(
          (p: Record<string, unknown>) => p.id === 'email-otp'
        );

        if (otpPlugin && typeof otpPlugin === 'object' && 'options' in otpPlugin) {
          const opts = otpPlugin.options as Record<string, unknown>;
          if (typeof opts.sendVerificationOTP === 'function') {
            try {
              await (opts.sendVerificationOTP as (args: unknown) => Promise<void>)({
                email: 'test@example.com',
                otp: '654321',
                type: 'sign-in',
              });
            } catch {
              // This test asserts logging only. In the simulated production
              // environment the QStash publish can fail (loopback destination),
              // and production correctly rethrows instead of reporting success.
            }

            expect(infoStub.calledWithMatch(/654321/)).to.equal(false);
            expect(debugStub.calledWithMatch(/654321/)).to.equal(false);
          }
        }
      } finally {
        // Assigning undefined would store the string "undefined" — delete instead.
        if (originalEnv === undefined) {
          delete mutableEnv.NODE_ENV;
        } else {
          mutableEnv.NODE_ENV = originalEnv;
        }
        if (originalQstashDev === undefined) {
          delete mutableEnv.QSTASH_DEV;
        } else {
          mutableEnv.QSTASH_DEV = originalQstashDev;
        }
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
