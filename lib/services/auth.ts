import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { oAuthProxy } from 'better-auth/plugins';
import { prisma } from '@/lib/infrastructure/prisma';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';

const env = getEnv();

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
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  advanced: {
    ipAddress: {
      ipv6Subnet: 128,
    },
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
  },
  advancedCookies: {
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  socialProviders: buildSocialProviders(),
  plugins: [
    oAuthProxy({
      currentURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp, type: otpType }) {
        if (email === undefined || email === null || email.length === 0) {
          logger.warn('OTP send requested but no email provided');
          return;
        }

        if (process.env.NODE_ENV !== 'production') {
          logger.info(`[DEV] ${otpType} OTP for ${email}: ${otp}`);
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
          if (process.env.NODE_ENV !== 'production') {
            logger.info(`[DEV FALLBACK] ${otpType} OTP for ${email}: ${otp}`);
          }
        }
      },
    }),
  ],
});
