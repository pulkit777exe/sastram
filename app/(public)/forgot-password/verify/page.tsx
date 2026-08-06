'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { SerifHeading } from '@/components/layout/serif-heading';
import { clientLogger } from '@/lib/utils/client-logger';
import { OtpInput } from '@/components/interior/otp-input';

export default function ForgotPasswordVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  const verifyOtp = async (code: string) => {
    if (!email || code.length !== 6) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/email-otp/check-verification-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, type: 'forget-password' }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        const errorMessage = result?.error?.message || result?.error || 'Invalid verification code';

        if (/expired/i.test(errorMessage)) {
          toasts.otpExpired();
        } else {
          toasts.invalidOtp();
        }

        setIsSubmitting(false);
        return;
      }

      window.sessionStorage.setItem('forgot_password_email', email);
      window.sessionStorage.setItem('forgot_password_otp', code);
      router.push('/forgot-password/reset');
    } catch (error) {
      clientLogger.error('[forgot-password:verify]', error instanceof Error ? error.message : String(error));
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (value: string) => {
    setOtp(value);
    if (value.length === 6) {
      void verifyOtp(value);
    }
  };

  const handleResend = async () => {
    if (!email || countdown > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/forget-password/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        toasts.serverError();
        setIsSubmitting(false);
        return;
      }

      setOtp('');
      setCountdown(60);
      toasts.sent();
      setIsSubmitting(false);
    } catch (error) {
      clientLogger.error('[forgot-password:resend]', error instanceof Error ? error.message : String(error));
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center py-16 px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 space-y-5 shadow-linear-sm">
        <div className="space-y-1 text-center">
          <SerifHeading as="h1" className="text-2xl tracking-tight block">
            Verify Reset Code
          </SerifHeading>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to {email || 'your email'}.
          </p>
        </div>

        <div className="flex justify-center">
          <OtpInput
            length={6}
            defaultValue={otp}
            onChange={handleOtpChange}
            disabled={isSubmitting}
            autoFocus
            label="Reset code"
          />
        </div>

        <Button
          type="button"
          onClick={() => void verifyOtp(otp)}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isSubmitting || otp.length !== 6}
        >
          {isSubmitting ? 'Verifying...' : 'Verify Code'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={handleResend}
          className="w-full"
          disabled={isSubmitting || countdown > 0}
        >
          {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
        </Button>
      </div>
    </main>
  );
}
