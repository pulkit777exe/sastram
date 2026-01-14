"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Command,
} from "lucide-react";
import { signIn, signUp, authClient } from "@/lib/services/auth-client";
import axios from "axios";
import { GithubIcon } from "@/public/icons/github";
import { ChromeIcon } from "@/public/icons/google";

type AuthMode = "signin" | "signup" | "magic-link" | "otp-verify";

const inputStyles =
  "h-12 rounded-xl bg-secondary/50 border-input text-foreground placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all";
const labelStyles = "text-muted-foreground text-sm font-medium";
const primaryButtonStyles =
  "h-12 rounded-xl bg-brand hover:bg-brand/90 text-white font-medium shadow-lg shadow-brand/20 transition-all hover:scale-[1.02] active:scale-[0.98]";
const outlineButtonStyles =
  "h-12 rounded-xl border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-all";

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

  if (mode === "magic-link") {
    return (
      <div className={cn("grid gap-6", className)} {...props}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground">
                We&apos;ll send a 6-digit code to your email
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="magic-email" className={labelStyles}>
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="name@example.com"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  required
                  disabled={loadingState !== null}
                  className={cn(inputStyles, "pl-12")}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-400/10 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loadingState !== null || !magicLinkEmail}
              className={primaryButtonStyles + " w-full"}
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
              className="w-full text-muted-foreground hover:text-foreground hover:bg-accent"
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
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div className="text-center mb-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4 border border-brand/20">
                <CheckCircle2 className="w-7 h-7 text-brand" />
              </div>
              <p className="text-sm text-muted-foreground">
                Code sent to{" "}
                <span className="font-medium text-white">{magicLinkEmail}</span>
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-muted-foreground text-center block text-sm">
                Enter 6-digit code
              </Label>
              <div className="flex justify-center gap-2 sm:gap-3">
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
                    className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-xl border-input bg-secondary text-foreground focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all caret-brand"
                  />
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-400/10 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loadingState !== null || otp.join("").length !== 6}
              className={primaryButtonStyles + " w-full"}
            >
              {loadingState === "otp" ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Verify & Sign In
            </Button>

            <div className="text-center text-sm space-y-3">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={countdown > 0 || loadingState !== null}
                className={cn(
                  "text-brand font-medium transition-colors hover:text-brand/80",
                  countdown > 0 &&
                    "text-muted-foreground cursor-not-allowed hover:text-muted-foreground"
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
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs"
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

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <form onSubmit={handleEmailAuth}>
        <div className="grid gap-4">
          {mode === "signup" && (
            <div className="grid gap-2">
              <Label className={labelStyles} htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                placeholder="Sherlock Holmes"
                type="text"
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect="off"
                disabled={loadingState !== null}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputStyles}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label className={labelStyles} htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="name@company.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={loadingState !== null}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputStyles}
            />
          </div>
          <div className="grid gap-2">
            <Label className={labelStyles} htmlFor="password">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                placeholder="Enter your password"
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
                className={cn(inputStyles, "pr-10")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loadingState !== null}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none disabled:opacity-50 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-400 text-center bg-red-400/10 py-2 rounded-lg">
              {error}
            </p>
          )}

          <Button
            disabled={loadingState !== null}
            type="submit"
            className={primaryButtonStyles}
          >
            {loadingState === "email" && (
              <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            {mode === "signup" ? "Create Account" : "Sign In"}
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
          className="text-center text-sm text-brand hover:text-brand/80 font-medium transition-colors group flex items-center justify-center"
        >
          <Sparkles className="inline mr-1.5 h-3.5 w-3.5 group-hover:animate-pulse" />
          Sign in with Magic Link instead
        </button>
      )}

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-4 text-muted-foreground font-medium">
            Or continue with
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("github")}
          className={cn(outlineButtonStyles, "flex-1")}
        >
          {loadingState === "github" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <div className="mr-2 opacity-90 invert dark:invert-0">
              <GithubIcon />
            </div>
          )}
          GitHub
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("google")}
          className={cn(outlineButtonStyles, "flex-1")}
        >
          {loadingState === "google" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <div className="mr-2">
              <ChromeIcon />
            </div>
          )}
          Google
        </Button>
      </div>

      <div className="text-center text-sm mt-4">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <span className="text-indigo-400 hover:underline underline-offset-4">
                Sign up
              </span>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <span className="text-indigo-400 hover:underline underline-offset-4">
                Sign in
              </span>
            </>
          )}
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
        return "Create your account";
      case "magic-link":
        return "Magic Link";
      case "otp-verify":
        return "Verify your email";
      default:
        return "Welcome back";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "signup":
        return "Join the community today.";
      case "magic-link":
        return "We'll send a code to your inbox.";
      case "otp-verify":
        return "Check your inbox for the code.";
      default:
        return "Enter your details to access your dashboard.";
    }
  };

  return (
    <div className="flex justify-center items-center h-screen w-full overflow-hidden bg-background">

      <div className="flex items-center justify-center p-8 bg-background text-foreground relative">
        <div className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-[400px]">
          <div className="flex flex-col gap-2 text-center mb-4">
            <div className="lg:hidden flex justify-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Command className="h-7 w-7" />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-3xl font-bold tracking-tight mb-2">
                  {getTitle()}
                </h1>
                <p className="text-muted-foreground text-sm">{getSubtitle()}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Form Container */}
          <div className="p-1">
            <UserAuthForm mode={mode} setMode={setMode} />
          </div>

          <p className="px-8 text-center text-xs text-muted-foreground">
            By clicking continue, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-primary transition-colors"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-primary transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
