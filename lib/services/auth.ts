import 'server-only';

import { betterAuth, APIError } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { oAuthProxy } from 'better-auth/plugins';
import { dash, sentinel } from '@better-auth/infra';
import { prisma } from '@/lib/infrastructure/prisma';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';

const env = getEnv();

/**
 * Better Auth Infra is opt-in: without an API key the plugins only log a
 * warning, so Sentinel is installed only when the key is present. This keeps
 * CI and fresh clones from waiting on hosted identify/security calls.
 */
const infraApiKey = env.BETTER_AUTH_API_KEY?.trim() ?? '';
const infraKvUrl = env.BETTER_AUTH_KV_URL ?? env.BETTER_AUTH_IDENTIFY_URL;

/**
 * better-auth throws `APIError` for expected rejections (invalid OTP, bad
 * email, too many attempts). Anything else — DB outage, provider failure — is
 * unexpected and must surface as a 500, not a client error.
 */
export function isAuthApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}

function buildSocialProviders() {
  const socialProvidersMap: Record<string, { clientId: string; clientSecret: string }> = {};

  // Half-configured OAuth is worse than none — it fails at the callback with a
  // confusing provider error, so refuse to boot instead.
  const oauthProviderCandidates = [
    ['google', 'Google', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ['github', 'GitHub', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  ] as const;

  for (const [providerId, providerLabel, clientIdEnvKey, clientSecretEnvKey] of oauthProviderCandidates) {
    const rawClientId = env[clientIdEnvKey];
    const rawClientSecret = env[clientSecretEnvKey];
    let trimmedClientId = '';
    if (rawClientId !== undefined && rawClientId !== null) {
      trimmedClientId = rawClientId.trim();
    }
    let trimmedClientSecret = '';
    if (rawClientSecret !== undefined && rawClientSecret !== null) {
      trimmedClientSecret = rawClientSecret.trim();
    }
    const hasClientId = trimmedClientId.length > 0;
    const hasClientSecret = trimmedClientSecret.length > 0;
    if (!hasClientId && !hasClientSecret) continue;

    if (!hasClientId || !hasClientSecret) {
      throw new Error(`${providerLabel} OAuth requires both ${clientIdEnvKey} and ${clientSecretEnvKey}`);
    }
    socialProvidersMap[providerId] = { clientId: trimmedClientId, clientSecret: trimmedClientSecret };
  }

  if (process.env.NODE_ENV === 'production' && Object.keys(socialProvidersMap).length === 0) {
    logger.warn('No social providers configured - only email OTP authentication available');
  }

  return socialProvidersMap;
}

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  advanced: {
    // Match the actual public scheme. A local Compose stack runs NODE_ENV=
    // production over http://localhost; forcing Secure there makes login
    // silently fail. Hosted production is https (enforced by check:prod).
    useSecureCookies: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
    ipAddress: {
      ipv6Subnet: 128,
    },
  },
  // Rate limiting: proxy.ts exempts /api/auth and /api/email-otp as public
  // (no session redirect) and does not apply its own rate limiting to them, so
  // Better Auth's limiter is authoritative for /api/auth/* and for plugin
  // routes such as /email-otp/*. Some app-owned wrappers (e.g.
  // /api/email-otp/reset-otp) add their own custom rate limiting; limits may
  // stack there, which is intentional defense in depth. Do not add customRules
  // that disable protection for raw /api/auth/* endpoints.
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    storage: 'memory',
    window: 60,
    max: 100,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'github'],
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          try {
            const { sendWelcomeEmail } = await import('@/lib/services/email');
            let displayName = newUser.name;
            if (displayName === null || displayName === undefined || displayName.length === 0) {
              displayName = 'there';
            }
            await sendWelcomeEmail(newUser.email, displayName);
            await prisma.user.update({
              where: { id: newUser.id },
              data: { welcomeEmailSent: true },
            });
            logger.info(`[auth] Welcome email sent to ${newUser.email}`);
          } catch (welcomeEmailError) {
            logger.error(`[auth] Failed to send welcome email to ${newUser.email}:`, welcomeEmailError);
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Verified in better-auth 1.7.18: emailOTP.resetPasswordEmailOTP calls
    // resetCredentialPassword(), which revokes sessions when this flag is set.
    revokeSessionsOnPasswordReset: true,
  },
  socialProviders: buildSocialProviders(),
  plugins: [
    dash({
      apiUrl: env.BETTER_AUTH_API_URL,
      kvUrl: infraKvUrl,
      apiKey: infraApiKey,
    }),
    ...(infraApiKey
      ? [
          sentinel({
            apiUrl: env.BETTER_AUTH_API_URL,
            kvUrl: infraKvUrl,
            apiKey: infraApiKey,
          }),
        ]
      : []),
    oAuthProxy({
      currentURL: env.NEXT_PUBLIC_APP_URL,
      productionURL: env.NEXT_PUBLIC_APP_URL,
    }),
    emailOTP({
      storeOTP: 'hashed',
      allowedAttempts: 3,
      expiresIn: 300,
      resendStrategy: 'rotate',
      async sendVerificationOTP({ email, otp, type: otpType }) {
        if (email === undefined || email === null || email.length === 0) {
          logger.warn('OTP send requested but no email provided');
          return;
        }

        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`[DEV] ${otpType} OTP for ${email}: ***${otp.slice(-2)}`);
        }

        // In development the logged code above is the delivery mechanism.
        if (process.env.NODE_ENV === 'development') {
          return;
        }

        try {
          logger.info(`Sending ${otpType} OTP to ${email}`);
          const { sendOTPEmail } = await import('@/lib/services/email');
          await sendOTPEmail(email, otp, otpType);
          logger.info(`Successfully sent ${otpType} OTP to ${email}`);
        } catch (otpSendError) {
          logger.error(`Failed to send ${otpType} OTP to ${email}:`, otpSendError);
          // Never tell the client an OTP was sent when delivery failed. Better
          // Auth turns this into a 500 so the user can retry.
          throw otpSendError;
        }
      },
    }),
  ],
});
