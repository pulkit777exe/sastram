import LoginPageClient from './LoginPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In - Sastram',
  description: 'Log in to your Sastram account.',
};

export default function LoginPage() {
  return <LoginPageClient />;
}
