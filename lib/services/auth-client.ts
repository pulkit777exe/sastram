import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';
import { sentinelClient } from '@better-auth/infra/client';

const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    emailOTPClient(),
    // Sentinel fingerprinting is opt-in. The default identify host is not in
    // our CSP and the global ingestion endpoint is explicitly discouraged by
    // Better Auth, so only enable it when a project-scoped URL is configured.
    ...(process.env.NEXT_PUBLIC_BETTER_AUTH_IDENTIFY_URL
      ? [
          sentinelClient({
            identifyUrl: process.env.NEXT_PUBLIC_BETTER_AUTH_IDENTIFY_URL,
          }),
        ]
      : []),
  ],
});

export const { signIn, signOut, signUp, useSession } = authClient;
