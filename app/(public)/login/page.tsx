import { redirect } from 'next/navigation';
import LoginPageClient from './LoginPageClient';
import type { Metadata } from 'next';
import { getSession } from '@/modules/auth/session';

export const metadata: Metadata = {
  title: 'Sign In - Sastram',
  description: 'Log in to your Sastram account.',
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }

  return <LoginPageClient />;
}
