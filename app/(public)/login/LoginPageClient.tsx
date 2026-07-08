'use client';

import { useState } from 'react';
import { LoginForm } from '@/components/auth';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';

export default function LoginPageClient() {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <>
      <LoginForm
        onForgotPassword={() => setShowForgotPassword(true)}
        onEmailChange={setEmail}
      />
      <ForgotPasswordModal
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
        initialEmail={email}
      />
    </>
  );
}
