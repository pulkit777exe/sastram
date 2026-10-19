'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { LoginForm } from '@/components/auth';

// 510-LOC Radix Dialog — keep it out of the /login initial chunk. The import
// only fires once the user asks for password recovery.
const ForgotPasswordModal = dynamic(
  () => import('@/components/auth/ForgotPasswordModal').then((mod) => mod.ForgotPasswordModal),
  { ssr: false }
);

export default function LoginPageClient() {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <>
      <LoginForm
        onForgotPassword={() => setShowForgotPassword(true)}
        onEmailChange={setEmail}
      />
      {showForgotPassword && (
        <ForgotPasswordModal
          open
          onOpenChange={setShowForgotPassword}
          initialEmail={email}
        />
      )}
    </>
  );
}
