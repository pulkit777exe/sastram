'use client';

import { useState } from 'react';
import { LoginForm } from '@/components/auth';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function LoginPage() {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <div className="bg-background">
      <ThemeToggle />
      <LoginForm 
        onForgotPassword={() => setShowForgotPassword(true)} 
        onEmailChange={setEmail}
      />
      <ForgotPasswordModal 
        open={showForgotPassword} 
        onOpenChange={setShowForgotPassword}
        initialEmail={email}
      />
    </div>
  );
}