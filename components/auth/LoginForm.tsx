'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LoaderIcon, Mail } from 'lucide-react';

import { GithubIcon } from '@/public/icons/github';
import { ChromeIcon } from '@/public/icons/google';
import { SerifHeading } from '@/components/layout/serif-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

import { OTP_LENGTH, type AuthMode, useAuthFlow } from './use-auth-flow';

const inputStyles =
  'h-12 rounded-card bg-secondary/50 border-input text-foreground placeholder:text-muted-foreground focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand transition-all';
const labelStyles = 'text-muted-foreground text-sm font-medium';

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-sm text-red-400 text-center bg-red-400/10 py-2 rounded-control" role="alert">
      {message}
    </p>
  );
}

function SocialButtons({
  loadingState,
  onSocialLogin,
}: {
  loadingState: 'email' | 'github' | 'google' | 'otp' | null;
  onSocialLogin: (provider: 'google' | 'github') => void;
}) {
  return (
    <div className="flex gap-4">
      <Button type="button" variant="outline" disabled={loadingState !== null} onClick={() => onSocialLogin('github')} className="flex-1">
        {loadingState === 'github' ? (
          <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <span className="mr-2 opacity-90 invert dark:invert-0">
            <GithubIcon />
          </span>
        )}
        GitHub
      </Button>
      <Button type="button" variant="outline" disabled={loadingState !== null} onClick={() => onSocialLogin('google')} className="flex-1">
        {loadingState === 'google' ? (
          <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <span className="mr-2">
            <ChromeIcon />
          </span>
        )}
        Google
      </Button>
    </div>
  );
}

function OtpRequestView({
  flow,
  onBack,
}: {
  flow: ReturnType<typeof useAuthFlow>;
  onBack: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <form onSubmit={flow.handleSendOtpRequest} className="space-y-4">
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">We&apos;ll send a 6-digit verification code to your email</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="otp-email" className={labelStyles}>Email address</Label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="otp-email"
              type="email"
              placeholder="name@example.com"
              value={flow.otpEmail}
              onChange={(e) => flow.setOtpEmail(e.target.value)}
              required
              disabled={flow.loadingState !== null}
              className={cn(inputStyles, 'pl-12')}
              autoComplete="email"
            />
          </div>
        </div>
        <FormError message={flow.error} />
        <Button type="submit" disabled={flow.loadingState !== null || !flow.otpEmail} className="w-full">
          {flow.loadingState === 'otp' ? <LoaderIcon className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Send Verification Code
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} className="w-full">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to sign in
        </Button>
      </form>
    </motion.div>
  );
}

function OtpVerifyView({ flow }: { flow: ReturnType<typeof useAuthFlow> }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <form onSubmit={flow.handleVerifyOtp} className="space-y-6">
        <div className="text-center mb-4">
          <div className="mx-auto w-14 h-14 rounded-card bg-brand/10 flex items-center justify-center mb-4 border border-brand/20">
            <CheckCircle2 className="w-7 h-7 text-brand" />
          </div>
          <p className="text-sm text-muted-foreground">
            Code sent to <span className="font-medium text-foreground">{flow.otpEmail}</span>
          </p>
        </div>
        <div className="space-y-3">
          <Label className="text-muted-foreground text-center block text-sm">Enter 6-digit code</Label>
          <div className="flex justify-center gap-2 sm:gap-3">
            {flow.otp.map((digit, index) => (
              <Input
                key={index}
                ref={(el) => {
                  flow.inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                aria-label={`Digit ${index + 1} of verification code`}
                value={digit}
                onChange={(e) => flow.handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => flow.handleOtpKeyDown(index, e)}
                disabled={flow.loadingState !== null}
                className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-card border-input bg-secondary text-foreground focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:border-brand transition-all caret-brand"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
              />
            ))}
          </div>
        </div>
        <FormError message={flow.error} />
        <Button type="submit" disabled={flow.loadingState !== null || flow.otp.join('').length !== OTP_LENGTH} className="w-full">
          {flow.loadingState === 'otp' ? <LoaderIcon className="mr-2 h-4 w-4 animate-spin" /> : null}
          Verify &amp; Sign In
        </Button>
        <div className="text-center text-sm space-y-3">
          <Button
            type="button"
            variant="link"
            onClick={flow.handleResendOtp}
            disabled={flow.countdown > 0 || flow.loadingState !== null}
            className={cn(
              'text-brand font-medium transition-colors hover:text-brand/80',
              flow.countdown > 0 && 'text-muted-foreground cursor-not-allowed hover:text-muted-foreground'
            )}
          >
            {flow.countdown > 0 ? `Resend code in ${flow.countdown}s` : 'Resend code'}
          </Button>
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                flow.setMode('email-otp');
                flow.setOtp(Array.from({ length: OTP_LENGTH }, () => ''));
              }}
              className="text-xs"
            >
              <ArrowLeft className="inline mr-1 h-3 w-3" />
              Use different email
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}

function CredentialsView({
  flow,
  onForgotPassword,
}: {
  flow: ReturnType<typeof useAuthFlow>;
  onForgotPassword?: () => void;
}) {
  const mode = flow.mode === 'signup' ? 'signup' : 'signin';
  return (
    <div className="grid gap-6">
      <form onSubmit={flow.handleEmailAuth}>
        <div className="grid gap-4">
          {mode === 'signup' && (
            <div className="grid gap-2">
              <Label className={labelStyles} htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Sherlock Holmes"
                type="text"
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect="off"
                disabled={flow.loadingState !== null}
                value={flow.name}
                onChange={(e) => flow.setName(e.target.value)}
                className={inputStyles}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label className={labelStyles} htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="name@company.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={flow.loadingState !== null}
              value={flow.email}
              onChange={(e) => flow.setEmail(e.target.value)}
              required
              className={inputStyles}
            />
          </div>
          <div className="grid gap-2">
            <Label className={labelStyles} htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                placeholder="Enter your password"
                type={flow.showPassword ? 'text' : 'password'}
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                autoCorrect="off"
                disabled={flow.loadingState !== null}
                value={flow.password}
                onChange={(e) => flow.setPassword(e.target.value)}
                required
                className={cn(inputStyles, 'pr-10')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => flow.setShowPassword(!flow.showPassword)}
                disabled={flow.loadingState !== null}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none disabled:opacity-50 transition-colors"
                aria-label={flow.showPassword ? 'Hide password' : 'Show password'}
              >
                {flow.showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
            {mode === 'signin' && onForgotPassword && (
              <div className="flex justify-end">
                <Button type="button" variant="link" onClick={onForgotPassword} className="text-xs text-brand hover:text-brand/80 p-0">
                  Forgot password?
                </Button>
              </div>
            )}
          </div>
          <FormError message={flow.error} />
          <Button disabled={flow.loadingState !== null} type="submit" className="w-full">
            {flow.loadingState === 'email' && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </Button>
        </div>
      </form>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-4 text-muted-foreground font-medium">Or continue with</span>
        </div>
      </div>

      <SocialButtons loadingState={flow.loadingState} onSocialLogin={flow.handleSocialLogin} />

      <div className="text-center text-sm mt-4">
        <Button type="button" variant="link" onClick={() => flow.setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-muted-foreground transition-colors">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account? <span className="text-brand hover:underline underline-offset-4">Sign up</span>
            </>
          ) : (
            <>
              Already have an account? <span className="text-brand hover:underline underline-offset-4">Sign in</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function getTitle(mode: AuthMode) {
  switch (mode) {
    case 'signup':
      return 'Create your account';
    case 'email-otp':
      return 'Sign in with OTP';
    case 'otp-verify':
      return 'Verify your email';
    default:
      return 'Welcome back';
  }
}

function getSubtitle(mode: AuthMode) {
  switch (mode) {
    case 'signup':
      return 'Join the community today.';
    case 'email-otp':
      return 'Use a one-time verification code sent to your inbox.';
    case 'otp-verify':
      return 'Check your inbox for the code.';
    default:
      return 'Enter your details to access your dashboard.';
  }
}

export function LoginForm({
  onForgotPassword,
  onEmailChange,
}: {
  onForgotPassword?: () => void;
  onEmailChange?: (email: string) => void;
}) {
  const flow = useAuthFlow(onEmailChange);

  return (
    <div className="flex flex-1 items-center justify-center py-16 px-6">
      <div className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-100">
        <div className="flex flex-col gap-2 text-center mb-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={flow.mode}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
            >
              <SerifHeading as="h1" className="text-3xl tracking-tight mb-2 block">
                {getTitle(flow.mode)}
              </SerifHeading>
              <p className="text-muted-foreground text-sm">{getSubtitle(flow.mode)}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-1">
          {flow.mode === 'email-otp' ? (
            <OtpRequestView flow={flow} onBack={() => flow.setMode('signin')} />
          ) : flow.mode === 'otp-verify' ? (
            <OtpVerifyView flow={flow} />
          ) : (
            <CredentialsView flow={flow} onForgotPassword={onForgotPassword} />
          )}
        </div>

        <p className="px-8 text-center text-xs text-muted-foreground">
          By clicking continue, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-4 hover:text-primary transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
