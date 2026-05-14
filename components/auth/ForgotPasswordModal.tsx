'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toasts } from '@/lib/utils/toast';

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail?: string;
}

function hasNumber(value: string) {
  return /\d/.test(value);
}

function hasSpecial(value: string) {
  return /[^A-Za-z0-9]/.test(value);
}

function ForgotPasswordEmailForm({
  initialEmail,
  onSuccess,
  onEmailChange,
  isSubmitting,
  setIsSubmitting,
}: {
  initialEmail: string;
  onSuccess: () => void;
  onEmailChange: (email: string) => void;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
}) {
  const [email, setEmail] = useState(initialEmail);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onEmailChange(email);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/forget-password/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      let result;
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok || result?.error) {
        toasts.serverError();
        setIsSubmitting(false);
        return;
      }

      toasts.sent();
      onSuccess();
    } catch (error) {
      console.error('[forgot-password:request]', error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Forgot Password</DialogTitle>
        <DialogDescription>
          Enter your email and we will send a 6-digit reset code.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4">
        <div className="space-y-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            placeholder="name@example.com"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !email}>
          {isSubmitting ? 'Sending...' : 'Send Reset Code'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ForgotPasswordOtpForm({
  email,
  onBack,
  onSuccess,
  onClose,
}: {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setCountdown((value) => value - 1);
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, startTransition]);

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

      let result;
      try {
        result = await response.json();
      } catch {
        result = {};
      }

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
      onSuccess();
    } catch (error) {
      console.error('[forgot-password:verify]', error);
      toasts.networkError();
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

      setOtp(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setCountdown(60);
      toasts.sent();
      setIsSubmitting(false);
    } catch (error) {
      console.error('[forgot-password:resend]', error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Verify Reset Code</DialogTitle>
        <DialogDescription>
          Enter the 6-digit code sent to {email}.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        <div className="flex justify-center gap-2">
          {otp.map((digit, index) => (
            <Input
              key={index}
              ref={(input) => {
                inputRefs.current[index] = input;
              }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="w-10 text-center"
              value={digit}
              disabled={isSubmitting}
              onChange={(event) => handleOtpChange(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && !otp[index] && index > 0) {
                  inputRefs.current[index - 1]?.focus();
                }
              }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={() => void verifyOtp(otp.join(''))}
            disabled={isSubmitting || otp.join('').length !== 6}
            className="flex-1"
          >
            {isSubmitting ? 'Verifying...' : 'Verify Code'}
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={handleResend}
          disabled={isSubmitting || countdown > 0}
          className="w-full"
        >
          {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
        </Button>
      </div>
    </>
  );
}

function ForgotPasswordResetForm({
  email,
  onBack,
  onClose,
}: {
  email: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validation = useMemo(() => {
    const minLength = password.length >= 8;
    const includesNumber = hasNumber(password);
    const includesSpecial = hasSpecial(password);
    const matches = password.length > 0 && password === confirmPassword;

    return {
      minLength,
      includesNumber,
      includesSpecial,
      matches,
      valid: minLength && includesNumber && includesSpecial && matches,
    };
  }, [password, confirmPassword]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validation.valid) {
      toasts.error('Please fix password validation issues.');
      return;
    }

    setIsSubmitting(true);

    try {
      const storedOtp = window.sessionStorage.getItem('forgot_password_otp') ?? '';
      const response = await fetch('/api/email-otp/reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: storedOtp, password }),
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

      onClose();
      toasts.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (error) {
      console.error('[forgot-password:reset]', error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Set New Password</DialogTitle>
        <DialogDescription>
          Choose a strong password for your account.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New Password</Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="rounded-md border border-border p-3 text-xs space-y-1 text-muted-foreground">
          <p className={validation.minLength ? 'text-emerald-500' : ''}>Minimum 8 characters</p>
          <p className={validation.includesNumber ? 'text-emerald-500' : ''}>At least one number</p>
          <p className={validation.includesSpecial ? 'text-emerald-500' : ''}>
            At least one special character
          </p>
          <p className={validation.matches ? 'text-emerald-500' : ''}>Passwords match</p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !validation.valid}
            className="flex-1"
          >
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ForgotPasswordModal({ open, onOpenChange, initialEmail = '' }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleOtpSent = () => {
    setIsSubmitting(false);
    setStep('otp');
  };

  const handleOtpVerified = () => {
    setIsSubmitting(false);
    setStep('reset');
  };

  const handleBack = () => {
    setStep('email');
    setFormKey((k) => k + 1);
  };

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setStep('email');
      setFormKey((k) => k + 1);
      setEmail(initialEmail);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-106.25">
        {step === 'email' ? (
          <ForgotPasswordEmailForm
            key={formKey}
            initialEmail={email}
            onSuccess={handleOtpSent}
            onEmailChange={setEmail}
            isSubmitting={isSubmitting}
            setIsSubmitting={setIsSubmitting}
          />
        ) : step === 'otp' ? (
          <ForgotPasswordOtpForm
            email={email}
            onBack={handleBack}
            onSuccess={handleOtpVerified}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <ForgotPasswordResetForm email={email} onBack={handleBack} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}