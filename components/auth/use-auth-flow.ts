'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient, signIn, signUp } from '@/lib/services/auth-client';
import { clientLogger } from '@/lib/utils/client-logger';
import { safeRedirectPath } from '@/lib/utils/safe-redirect';
import { toasts } from '@/lib/utils/toast';

export type AuthMode = 'signin' | 'signup' | 'email-otp' | 'otp-verify';

export const OTP_LENGTH = 6;
export const RESEND_COUNTDOWN_SECONDS = 60;
const COUNTDOWN_MS = 1000;
const NON_DIGIT_PATTERN = /[^0-9]/g;
const EXPIRED_PATTERN = /expired/i;
const NOT_VERIFIED_PATTERN = /email.*not.*verif|verify.*email/i;

export function getRedirectTarget(searchParams: URLSearchParams): string {
  const fromQuery = safeRedirectPath(searchParams.get('redirect'), '');
  if (fromQuery) return fromQuery;

  if (typeof window !== 'undefined' && document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      const fromReferrer = safeRedirectPath(`${referrerUrl.pathname}${referrerUrl.search}`, '');
      if (fromReferrer && fromReferrer !== '/login') return fromReferrer;
    } catch {
      // Invalid referrer URL — fall through to default
    }
  }

  return '/dashboard';
}

async function postOtpSend(email: string, type: 'sign-in' | 'email-verification' | 'forget-password') {
  const res = await fetch('/api/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, type }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
  if (res.ok && !data?.error) return { ok: true as const };
  const message =
    typeof data?.error === 'string'
      ? data.error
      : data?.error?.message || 'Failed to send verification code';
  return { ok: false as const, message };
}

export function useAuthFlow(onEmailChange?: (email: string) => void) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getRedirectTarget(searchParams);

  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array.from({ length: OTP_LENGTH }, () => ''));
  const [loadingState, setLoadingState] = useState<'email' | 'github' | 'google' | 'otp' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [otpEmail, setOtpEmail] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const hasShownReasonToast = useRef(false);
  const verifyingOtpRef = useRef(false);

  useEffect(() => {
    if (hasShownReasonToast.current) return;
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      toasts.sessionExpired();
      hasShownReasonToast.current = true;
    } else if (reason === 'unauthorized') {
      toasts.info('You need to sign in to access that page.');
      hasShownReasonToast.current = true;
    }
  }, [searchParams]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), COUNTDOWN_MS);
    return () => clearTimeout(timer);
  }, [countdown]);

  const updateEmail = useCallback(
    (value: string) => {
      setEmail(value);
      onEmailChange?.(value);
    },
    [onEmailChange]
  );

  const resetError = useCallback(() => setError(null), []);

  const goToMode = useCallback((next: AuthMode) => {
    setMode(next);
    setError(null);
  }, []);

  const beginOtpVerification = useCallback((targetEmail: string) => {
    setOtpEmail(targetEmail);
    setOtp(Array.from({ length: OTP_LENGTH }, () => ''));
    setMode('otp-verify');
    setCountdown(RESEND_COUNTDOWN_SECONDS);
    setError(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, []);

  const sendVerificationCode = useCallback(
    async (targetEmail: string, type: 'sign-in' | 'email-verification' = 'sign-in') => {
      setLoadingState('otp');
      setError(null);
      try {
        const result = await postOtpSend(targetEmail, type);
        if (!result.ok) {
          setError(result.message);
          return false;
        }
        return true;
      } catch (err) {
        clientLogger.error('useAuthFlow', 'send OTP failed', err);
        setError('Failed to send verification code. Please try again.');
        return false;
      } finally {
        setLoadingState(null);
      }
    },
    []
  );

  const handleEmailAuth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoadingState('email');
      setError(null);

      try {
        if (mode === 'signup') {
          const result = await signUp.email({
            email,
            password,
            name: name || email.split('@')[0],
            callbackURL: redirectTarget,
          });
          if (result.error) {
            setError(result.error.message || 'Signup failed. Please try again.');
            return;
          }
          setOtpEmail(email);
          const ok = await postOtpSend(email, 'sign-in').then(
            (r) => r.ok || (setError(r.message), false),
            () => (setError('Failed to send verification code. Please try again.'), false)
          );
          if (ok) beginOtpVerification(email);
          return;
        }

        const result = await signIn.email({ email, password, callbackURL: redirectTarget });
        if (result.error) {
          if (NOT_VERIFIED_PATTERN.test(result.error.message || '')) {
            setOtpEmail(email);
            const sent = await postOtpSend(email, 'sign-in');
            if (sent.ok) {
              beginOtpVerification(email);
              return;
            }
            setError(sent.message);
            return;
          }
          setError(result.error.message || 'Login failed. Please check your credentials.');
          return;
        }
        router.push(redirectTarget);
      } catch (err) {
        clientLogger.error('useAuthFlow', `${mode === 'signup' ? 'Signup' : 'Login'} failed`, err);
        setError(err instanceof Error ? err.message : `${mode === 'signup' ? 'Signup' : 'Login'} failed. Please try again.`);
      } finally {
        setLoadingState(null);
      }
    },
    [beginOtpVerification, email, mode, name, password, redirectTarget, router]
  );

  const handleSocialLogin = useCallback(
    async (provider: 'google' | 'github') => {
      setLoadingState(provider);
      setError(null);
      try {
        const result = await signIn.social({ provider, callbackURL: redirectTarget });
        if (result.error) {
          setError(result.error.message || 'Social login failed. Please try again.');
          setLoadingState(null);
        }
        // On success, Better Auth redirects the browser.
      } catch (err) {
        clientLogger.error('useAuthFlow', 'Social login failed', err);
        setError(err instanceof Error ? err.message : 'Social login failed. Please try again.');
        setLoadingState(null);
      }
    },
    [redirectTarget]
  );

  const handleSendOtpRequest = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const ok = await sendVerificationCode(otpEmail, 'sign-in');
      if (ok) beginOtpVerification(otpEmail);
    },
    [beginOtpVerification, otpEmail, sendVerificationCode]
  );

  const verifyOtpCode = useCallback(
    async (otpCode: string) => {
      if (otpCode.length !== OTP_LENGTH || verifyingOtpRef.current) return;
      verifyingOtpRef.current = true;
      setLoadingState('otp');
      setError(null);
      try {
        const result = await authClient.signIn.emailOtp({ email: otpEmail, otp: otpCode });
        if (result.error) {
          const message = result.error.message || 'Invalid verification code';
          if (EXPIRED_PATTERN.test(message)) toasts.otpExpired();
          else toasts.invalidOtp();
          setError(message);
          return;
        }
        router.push(redirectTarget);
      } catch (err) {
        clientLogger.error('useAuthFlow', 'Verify OTP error', err);
        toasts.serverError();
        setError('Verification failed. Please try again.');
      } finally {
        setLoadingState(null);
        verifyingOtpRef.current = false;
      }
    },
    [otpEmail, redirectTarget, router]
  );

  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      const digits = value.replace(NON_DIGIT_PATTERN, '');
      if (digits.length > 1) {
        const pasted = digits.slice(0, OTP_LENGTH).split('');
        const next = [...otp];
        pasted.forEach((char, i) => {
          if (index + i < OTP_LENGTH) next[index + i] = char;
        });
        setOtp(next);
        inputRefs.current[Math.min(index + pasted.length, OTP_LENGTH - 1)]?.focus();
        const code = next.join('');
        if (code.length === OTP_LENGTH && next.every((d) => d)) void verifyOtpCode(code);
        return;
      }
      const next = [...otp];
      next[index] = digits;
      setOtp(next);
      if (digits && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
      if (next.every((d) => d) && next.join('').length === OTP_LENGTH) void verifyOtpCode(next.join(''));
    },
    [otp, verifyOtpCode]
  );

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [otp]);

  const handleVerifyOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const code = otp.join('');
      if (code.length !== OTP_LENGTH) {
        setError('Please enter the complete 6-digit code');
        return;
      }
      await verifyOtpCode(code);
    },
    [otp, verifyOtpCode]
  );

  const handleResendOtp = useCallback(async () => {
    if (countdown > 0) return;
    const ok = await sendVerificationCode(otpEmail, 'sign-in');
    if (ok) {
      setCountdown(RESEND_COUNTDOWN_SECONDS);
      setOtp(Array.from({ length: OTP_LENGTH }, () => ''));
      inputRefs.current[0]?.focus();
    }
  }, [countdown, otpEmail, sendVerificationCode]);

  return {
    mode,
    setMode: goToMode,
    name,
    setName,
    email,
    setEmail: updateEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    otp,
    setOtp,
    otpEmail,
    setOtpEmail,
    loadingState,
    error,
    setError,
    resetError,
    countdown,
    inputRefs,
    handleEmailAuth,
    handleSocialLogin,
    handleSendOtpRequest,
    handleOtpChange,
    handleOtpKeyDown,
    handleVerifyOtp,
    handleResendOtp,
    verifyOtpCode,
    redirectTarget,
  };
}
