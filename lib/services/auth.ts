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
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID || '',
      clientSecret: env.GITHUB_CLIENT_SECRET || '',
    },
  },
  plugins: [
    oAuthProxy({
      currentURL: 'http://localhost:3000',
      productionURL: process.env.NEXT_PUBLIC_APP_URL,
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (!email) {
          logger.warn('OTP send requested but no email provided');
          return;
        }

        logger.info(`[DEV] ${type} OTP for ${email}: ${otp}`);

        const isDevelopment = process.env.NODE_ENV === 'development';

        if (isDevelopment) {
          return;
        }

        try {
          logger.info(`Sending ${type} OTP to ${email}`);
          // Dynamic import to avoid bundling fs in client
          const { sendOTPEmail } = await import('@/lib/services/email');
          await sendOTPEmail(email, otp, type);
          logger.info(`Successfully sent ${type} OTP to ${email}`);
        } catch (error) {
          logger.error(`Failed to send ${type} OTP to ${email}:`, error);
          logger.info(`[DEV FALLBACK] ${type} OTP for ${email}: ${otp}`);
        }
      },
    }),
  ],
});
