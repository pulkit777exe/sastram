"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LoaderIcon,
  Eye,
  EyeOff,
  Mail,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { signIn, signUp, authClient } from "@/lib/services/auth-client";
import axios from "axios";

type AuthMode = "signin" | "signup" | "magic-link" | "otp-verify";

function UserAuthForm({
  className,
  mode,
  setMode,
  ...props
}: React.ComponentProps<"div"> & {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loadingState, setLoadingState] = useState<
    "email" | "github" | "google" | "otp" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingState("email");
    setError(null);

    try {
      if (mode === "signup") {
        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          callbackURL: "/dashboard",
        });

        if (result.error) {
          setError(result.error.message || "Signup failed. Please try again.");
          setLoadingState(null);
          return;
        }

        if (result.data) {
          router.push("/dashboard");
          router.refresh();
        } else {
          router.push("/dashboard");
          router.refresh();
        }
      } else {
        const result = await signIn.email({
          email,
          password,
          callbackURL: "/dashboard",
        });

        if (result.error) {
          setError(
            result.error.message ||
              "Login failed. Please check your credentials."
          );
          setLoadingState(null);
          return;
        }

        if (result.data) {
          router.push("/dashboard");
          router.refresh();
        } else {
          router.push("/dashboard");
          router.refresh();
        }
      }
    } catch (error) {
      console.error(`${mode === "signup" ? "Signup" : "Login"} failed:`, error);
      setError(
        (error instanceof Error ? error.message : String(error)) ||
          `${mode === "signup" ? "Signup" : "Login"} failed. Please try again.`
      );
      setLoadingState(null);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github") => {
    setLoadingState(provider);
    setError(null);
    try {
      const result = await signIn.social({
        provider,
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setError(
          result.error.message || "Social login failed. Please try again."
        );
        setLoadingState(null);
        return;
      }
    } catch (error) {
      console.error("Social login failed:", error);
      setError(
        (error instanceof Error ? error.message : String(error)) ||
          "Social login failed. Please try again."
      );
      setLoadingState(null);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingState("otp");
    setError(null);

    try {
      const { data } = await axios.post(
        "/api/email-otp/send-verification-otp",
        {
          email: magicLinkEmail,
          type: "sign-in",
        }
      );

      if (data.error) {
        setError(data.error?.message || "Failed to send verification code");
        setLoadingState(null);
        return;
      }

      setMode("otp-verify");
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      console.error("Send OTP error:", err);
      setError("Failed to send verification code. Please try again.");
    } finally {
      setLoadingState(null);
    }
  };

  const handleOTPChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pastedValues = value.slice(0, 6).split("");
      const newOtp = [...otp];
      pastedValues.forEach((char, i) => {
        if (index + i < 6) {
          newOtp[index + i] = char;
        }
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + pastedValues.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOTPKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otp.join("");
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setLoadingState("otp");
    setError(null);

    try {
      const result = await authClient.signIn.emailOtp({
        email: magicLinkEmail,
        otp: otpCode,
      });

      if (result.error) {
        setError(result.error.message || "Invalid verification code");
        setLoadingState(null);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Verify OTP error:", err);
      setError("Verification failed. Please try again.");
      setLoadingState(null);
    }
  };

  const handleResendOTP = async () => {
    if (countdown > 0) return;

    setLoadingState("otp");
    setError(null);

    try {
      const { data } = await axios.post(
        "/api/email-otp/send-verification-otp",
        {
          email: magicLinkEmail,
          type: "sign-in",
        }
      );

      if (data.error) {
        throw new Error("Failed to resend code");
      }

      setCountdown(60);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setLoadingState(null);
    }
  };

  // Magic Link / OTP Form
  if (mode === "magic-link") {
    return (
      <div className={cn("grid gap-6", className)} {...props}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-sm text-slate-500">
                We&apos;ll send a 6-digit code to your email
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="magic-email" className="text-slate-700">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="name@example.com"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  required
                  disabled={loadingState !== null}
                  className="pl-10 h-11 text-black rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loadingState !== null || !magicLinkEmail}
              className="w-full h-11 rounded-xl bg-black hover:bg-black/80 text-white font-medium shadow-lg shadow-black/30 transition-all"
            >
              {loadingState === "otp" ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send Magic Code
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className="w-full text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to password login
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  // OTP Verification Form
  if (mode === "otp-verify") {
    return (
      <div className={cn("grid gap-6", className)} {...props}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={handleVerifyOTP} className="space-y-5">
            <div className="text-center mb-4">
              <div className="mx-auto w-12 h-12 rounded-xl bg-linear-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm text-slate-500">
                Code sent to{" "}
                <span className="font-medium text-slate-700">
                  {magicLinkEmail}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 text-center block text-sm">
                Enter 6-digit code
              </Label>
              <div className="flex justify-center gap-2">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={digit}
                    onChange={(e) =>
                      handleOTPChange(
                        index,
                        e.target.value.replace(/[^0-9]/g, "")
                      )
                    }
                    onKeyDown={(e) => handleOTPKeyDown(index, e)}
                    disabled={loadingState !== null}
                    className="w-11 h-12 text-center text-lg font-bold rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loadingState !== null || otp.join("").length !== 6}
              className="w-full h-11 rounded-xl bg-black hover:bg-black/80 text-white font-medium shadow-lg shadow-black/30 transition-all"
            >
              {loadingState === "otp" ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Verify & Sign In
            </Button>

            <div className="text-center text-sm space-y-2">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={countdown > 0 || loadingState !== null}
                className={cn(
                  "text-black font-medium transition-colors",
                  countdown > 0 &&
                    "text-slate-400 cursor-not-allowed hover:text-slate-400"
                )}
              >
                {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setMode("magic-link");
                    setOtp(["", "", "", "", "", ""]);
                    setError(null);
                  }}
                  className="text-slate-500 hover:text-slate-900"
                >
                  <ArrowLeft className="inline mr-1 h-3 w-3" />
                  Use different email
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  // Standard Email/Password Form
  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <form onSubmit={handleEmailAuth}>
        <div className="grid gap-4">
          {mode === "signup" && (
            <div className="grid gap-2">
              <Label className="sr-only" htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                placeholder="Your name"
                type="text"
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect="off"
                disabled={loadingState !== null}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-grey-500 transition-all"
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label className="sr-only" htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={loadingState !== null}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-grey-500 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label className="sr-only" htmlFor="password">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                placeholder="Password"
                type={showPassword ? "text" : "password"}
                autoCapitalize="none"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                autoCorrect="off"
                disabled={loadingState !== null}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-grey-500 transition-all pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loadingState !== null}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none focus:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button
            disabled={loadingState !== null}
            type="submit"
            className="h-11 rounded-xl bg-black hover:bg-black/80 text-white font-medium shadow-lg shadow-black/30 transition-all hover:shadow-black/40"
          >
            {loadingState === "email" && (
              <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            {mode === "signup" ? "Create Account" : "Sign In with Email"}
          </Button>
        </div>
      </form>

      {mode === "signin" && (
        <button
          type="button"
          onClick={() => {
            setMode("magic-link");
            setError(null);
          }}
          className="text-center text-sm text-black hover:text-black/80 font-medium transition-colors"
        >
          <Sparkles className="inline mr-1 h-3 w-3" />
          Sign in with Magic Link instead
        </button>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">Or continue with</span>
        </div>
      </div>
      <div className="flex gap-4">
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("github")}
          className="flex-1 h-11 rounded-xl border-slate-200 hover:bg-slate-50 hover:text-slate-900"
        >
          {loadingState === "github" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Image
              src="/github.jpg"
              alt="GitHub"
              width={16}
              height={16}
              className="mr-2 opacity-70"
            />
          )}
          GitHub
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("google")}
          className="flex-1 h-11 rounded-xl border-slate-200 hover:bg-slate-50 hover:text-slate-900"
        >
          {loadingState === "google" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Image
              src="/google.jpg"
              alt="Google"
              width={16}
              height={16}
              className="mr-2 opacity-70"
            />
          )}
          Google
        </Button>
      </div>
      <div className="text-center text-sm">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="text-slate-600 hover:text-slate-900 underline underline-offset-4"
        >
          {mode === "signin"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

export function LoginForm() {
  const [mode, setMode] = useState<AuthMode>("signin");

  const getTitle = () => {
    switch (mode) {
      case "signup":
        return "Create an account";
      case "magic-link":
        return "Magic Link Sign In";
      case "otp-verify":
        return "Verify Your Email";
      default:
        return "Welcome back";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "signup":
        return "Enter your details below to create your account";
      case "magic-link":
        return "No password needed, we'll email you a code";
      case "otp-verify":
        return "Enter the code we sent to your email";
      default:
        return "Enter your email below to sign in to your account";
    }
  };

  return (
    <div className="relative container flex-1 shrink-0 items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0 min-h-screen bg-white">
      <div className="relative hidden h-full flex-col bg-slate-900 p-10 text-white lg:flex dark:border-r">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1759818319027-dc631ed9732b?q=80&w=2036&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)",
          }}
        />
        <div className="relative z-20 flex items-center text-lg font-bold tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-white"
            >
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
            </svg>
          </div>
          Sastram
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;This library has saved me countless hours of work and
              helped me deliver stunning designs to my clients faster than ever
              before.&rdquo;
            </p>
            <footer className="text-sm text-slate-400">Sofia Davis</footer>
          </blockquote>
        </div>
      </div>
      <div className="flex items-center justify-center lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-[350px]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-2 text-center"
            >
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {getTitle()}
              </h1>
              <p className="text-slate-500 text-sm">{getSubtitle()}</p>
            </motion.div>
          </AnimatePresence>
          <UserAuthForm mode={mode} setMode={setMode} />
          <p className="px-8 text-center text-sm text-slate-400">
            By clicking continue, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-slate-900"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-slate-900"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}
