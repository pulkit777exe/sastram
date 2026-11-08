'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toasts } from '@/lib/utils/toast';
import { SerifHeading } from '@/components/layout/serif-heading';
import { clientLogger } from '@/lib/utils/client-logger';

function ForgotPasswordVerifyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawEmail = searchParams.get('email');
  let email: string;
  if (rawEmail !== null && rawEmail !== '') {
    email = rawEmail;
  } else {
    email = '';
  }

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyingRef = useRef(false);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

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
    if (!email) {
      toasts.error('Missing email address. Please start over.');
      return;
    }
    if (code.length !== 6 || verifyingRef.current) {
      return;
    }

    verifyingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/email-otp/check-verification-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, type: 'forget-password' }),
      });

      let result: { error?: { message?: string } | string } = {};
      try {
        result = (await response.json()) as { error?: { message?: string } | string };
      } catch {
        result = {};
      }

      if (!response.ok || result?.error) {
        const errorMessage =
          typeof result?.error === 'string'
            ? result.error
            : result?.error?.message || 'Invalid verification code';

        if (/expired/i.test(errorMessage)) {
          toasts.otpExpired();
        } else {
          toasts.invalidOtp();
        }

        return;
      }

      window.sessionStorage.setItem('forgot_password_email', email);
      window.sessionStorage.setItem('forgot_password_otp', code);
      router.push('/forgot-password/reset');
    } catch (error) {
      clientLogger.error('[forgot-password:verify]', error instanceof Error ? error.message : String(error));
      toasts.networkError();
    } finally {
      verifyingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index: number, rawValue: string) => {
    const value = rawValue.replace(/[^0-9]/g, '');

    if (value.length > 1) {
      const pastedValues = value.slice(0, 6).split('');
      const nextOtp = [...otp];

      pastedValues.forEach((char, charIndex) => {
        if (index + charIndex < 6) {
          nextOtp[index + charIndex] = char;
        }
      });

      setOtp(nextOtp);
      inputRefs.current[Math.min(5, index + pastedValues.length)]?.focus();

      if (nextOtp.join('').length === 6) {
        void verifyOtp(nextOtp.join(''));
      }

      return;
    }

    const nextOtp = [...otp];
    nextOtp[index] = value;
    setOtp(nextOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (nextOtp.join('').length === 6) {
      void verifyOtp(nextOtp.join(''));
    }
  };

  const handleResend = async () => {
    if (!email) {
      toasts.error('Missing email address. Please start over.');
      return;
    }
    if (countdown > 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/forget-password/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      let result: { error?: unknown } = {};
      try {
        result = (await response.json()) as { error?: unknown };
      } catch {
        result = {};
      }

      if (!response.ok || result?.error) {
        toasts.serverError();
        setIsSubmitting(false);
        return;
      }

      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setCountdown(60);
      toasts.sent();
    } catch (error) {
      clientLogger.error('[forgot-password:resend]', error instanceof Error ? error.message : String(error));
      toasts.networkError();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center py-16 px-6">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 space-y-5 shadow-card">
        <div className="space-y-1 text-center">
          <SerifHeading as="h1" className="text-2xl tracking-tight block">
            Verify Reset Code
          </SerifHeading>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to {email || 'your email'}.
          </p>
          {!email && (
            <p className="text-sm text-ink-2">
              Missing email address.{' '}
              <a href="/forgot-password" className="text-brand underline-offset-2 hover:underline">
                Start over
              </a>
              .
            </p>
          )}
        </div>

        <div className="flex justify-center gap-2">
          {otp.map((digit, index) => (
            <Input
              key={index}
              ref={(input) => {
                inputRefs.current[index] = input;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${index + 1} of verification code`}
              className="w-10 h-12 text-center rounded-card"
              value={digit}
              disabled={isSubmitting || !email}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text').replace(/[^0-9]/g, '');
                if (pasted.length <= 1) return;
                event.preventDefault();
                const nextOtp = [...otp];
                pasted.slice(0, 6).split('').forEach((char, i) => {
                  if (index + i < 6) nextOtp[index + i] = char;
                });
                setOtp(nextOtp);
                inputRefs.current[Math.min(5, index + pasted.length)]?.focus();
                if (nextOtp.every((d) => d) && nextOtp.join('').length === 6) {
                  void verifyOtp(nextOtp.join(''));
                }
              }}
              onChange={(event) => handleOtpChange(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && !otp[index] && index > 0) {
                  inputRefs.current[index - 1]?.focus();
                }
              }}
            />
          ))}
        </div>

        <Button
          type="button"
          className="w-full h-11"
          onClick={() => void verifyOtp(otp.join(''))}
          disabled={!email || isSubmitting || otp.join('').length !== 6}
        >
          {isSubmitting ? 'Verifying...' : 'Verify Code'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={handleResend}
          disabled={!email || isSubmitting || countdown > 0}
        >
          {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
        </Button>
      </div>
    </main>
  );
}

export default function ForgotPasswordVerifyPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordVerifyPageInner />
    </Suspense>
  );
}
