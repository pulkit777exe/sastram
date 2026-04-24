'use client';

import { useState } from 'react';
import { LoginForm } from '@/components/auth';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function LoginPage() {
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  return (
    <div className="bg-background">
      <ThemeToggle />
      <LoginForm onForgotPassword={() => setShowForgotPassword(true)} />
      <ForgotPasswordModal open={showForgotPassword} onOpenChange={setShowForgotPassword} />
    </div>
  );
}