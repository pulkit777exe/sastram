'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toasts } from '@/lib/utils/toast';
import { clientLogger } from '@/lib/utils/client-logger';
import { validatePassword } from '@/lib/utils/password-validation';
import { SerifHeading } from '@/components/layout/serif-heading';

export default function ForgotPasswordResetPage() {
  const router = useRouter();
  const [email] = useState(() =>
    typeof window !== 'undefined'
      ? (window.sessionStorage.getItem('forgot_password_email') ?? '')
      : ''
  );
  const [otp] = useState(() =>
    typeof window !== 'undefined'
      ? (window.sessionStorage.getItem('forgot_password_otp') ?? '')
      : ''
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!email || !otp) {
      router.replace('/forgot-password');
    }
  }, [email, otp, router]);

  const validation = useMemo(
    () => validatePassword(password, confirmPassword),
    [password, confirmPassword]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validation.valid) {
      toasts.error('Please fix password validation issues.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/email-otp/reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, password }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        const message = result?.error?.message || result?.error || 'Password reset failed';
        if (/expired/i.test(message)) {
          toasts.otpExpired();
        } else {
          toasts.error('Failed to reset password.', message);
        }

        setIsSubmitting(false);
        return;
      }

      window.sessionStorage.removeItem('forgot_password_email');
      window.sessionStorage.removeItem('forgot_password_otp');

      toasts.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (error) {
      clientLogger.error('ForgotPassword', 'Reset password failed', error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center py-16 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8 space-y-5 shadow-linear-sm"
      >
        <div className="space-y-1">
          <SerifHeading as="h1" className="text-2xl tracking-tight block">
            Set New Password
          </SerifHeading>
          <p className="text-sm text-muted-foreground">
            Choose a strong password for {email || 'your account'}.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            required
            className="h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSubmitting}
            required
            className="h-11 rounded-xl"
          />
        </div>

        <div className="rounded-xl border border-border p-3 text-xs space-y-1 text-muted-foreground">
          <p className={validation.minLength ? 'text-emerald-500' : ''}>Minimum 8 characters</p>
          <p className={validation.includesNumber ? 'text-emerald-500' : ''}>At least one number</p>
          <p className={validation.includesSpecial ? 'text-emerald-500' : ''}>
            At least one special character
          </p>
          <p className={validation.matches ? 'text-emerald-500' : ''}>Passwords match</p>
        </div>

        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isSubmitting || !validation.valid}
        >
          {isSubmitting ? 'Updating...' : 'Update Password'}
        </Button>
      </form>
    </main>
  );
}
