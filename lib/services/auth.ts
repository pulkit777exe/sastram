import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { oAuthProxy } from 'better-auth/plugins';
import { prisma } from '@/lib/infrastructure/prisma';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';

const env = getEnv();

function buildSocialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  // Half-configured OAuth is worse than none — it fails at the callback with a
  // confusing provider error, so refuse to boot instead.
  const candidates = [
    ['google', 'Google', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ['github', 'GitHub', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  ] as const;

  for (const [name, label, idKey, secretKey] of candidates) {
    const clientId = env[idKey]?.trim();
    const clientSecret = env[secretKey]?.trim();
    if (!clientId && !clientSecret) continue;

    if (!clientId || !clientSecret) {
      throw new Error(`${label} OAuth requires both ${idKey} and ${secretKey}`);
    }
    providers[name] = { clientId, clientSecret };
  }

  if (process.env.NODE_ENV === 'production' && Object.keys(providers).length === 0) {
    logger.warn('No social providers configured - only email OTP authentication available');
  }

  return providers;
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
        after: async (user) => {
          try {
            const { sendWelcomeEmail } = await import('@/lib/services/email');
            await sendWelcomeEmail(user.email, user.name ?? 'there');
            await prisma.user.update({
              where: { id: user.id },
              data: { welcomeEmailSent: true },
            });
            logger.info(`[auth] Welcome email sent to ${user.email}`);
          } catch (error) {
            logger.error(`[auth] Failed to send welcome email to ${user.email}:`, error);
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
      async sendVerificationOTP({ email, otp, type }) {
        if (!email) {
          logger.warn('OTP send requested but no email provided');
          return;
        }

        if (process.env.NODE_ENV !== 'production') {
          logger.info(`[DEV] ${type} OTP for ${email}: ${otp}`);
        }

        // In development the logged code above is the delivery mechanism.
        if (process.env.NODE_ENV === 'development') {
          return;
        }

        try {
          logger.info(`Sending ${type} OTP to ${email}`);
          const { sendOTPEmail } = await import('@/lib/services/email');
          await sendOTPEmail(email, otp, type);
          logger.info(`Successfully sent ${type} OTP to ${email}`);
        } catch (error) {
          logger.error(`Failed to send ${type} OTP to ${email}:`, error);
          if (process.env.NODE_ENV !== 'production') {
            logger.info(`[DEV FALLBACK] ${type} OTP for ${email}: ${otp}`);
          }
        }
      },
    }),
  ],
});
