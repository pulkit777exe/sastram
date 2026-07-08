import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { oAuthProxy } from 'better-auth/plugins';
import { prisma } from '@/lib/infrastructure/prisma';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';

const env = getEnv();

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
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
  socialProviders: (() => {
    const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

    const googleId = env.GOOGLE_CLIENT_ID?.trim();
    const googleSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    const githubId = env.GITHUB_CLIENT_ID?.trim();
    const githubSecret = env.GITHUB_CLIENT_SECRET?.trim();

    if (googleId || googleSecret) {
      if (!googleId || !googleSecret) {
        throw new Error('Google OAuth requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
      }
      socialProviders.google = { clientId: googleId, clientSecret: googleSecret };
    }

    if (githubId || githubSecret) {
      if (!githubId || !githubSecret) {
        throw new Error('GitHub OAuth requires both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
      }
      socialProviders.github = { clientId: githubId, clientSecret: githubSecret };
    }

    if (process.env.NODE_ENV === 'production' && Object.keys(socialProviders).length === 0) {
      logger.warn('No social providers configured - only email OTP authentication available');
    }

    return socialProviders;
  })(),
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
