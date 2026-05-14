import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [emailOTPClient()],
});

if (process.env.NODE_ENV === 'development') {
  console.log('Auth client initialized with baseURL:', getBaseURL());
}

export const { signIn, signOut, signUp, useSession } = authClient;
