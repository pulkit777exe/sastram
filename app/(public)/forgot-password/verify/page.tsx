"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toasts } from "@/lib/utils/toast";

export default function ForgotPasswordVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
    if (!email || code.length !== 6) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/email-otp/check-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code, type: "forget-password" }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        const errorMessage =
          result?.error?.message || result?.error || "Invalid verification code";

        if (/expired/i.test(errorMessage)) {
          toasts.otpExpired();
        } else {
          toasts.invalidOtp();
        }

        setIsSubmitting(false);
        return;
      }

      window.sessionStorage.setItem("forgot_password_email", email);
      window.sessionStorage.setItem("forgot_password_otp", code);
      router.push("/forgot-password/reset");
    } catch (error) {
      console.error("[forgot-password:verify]", error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index: number, rawValue: string) => {
    const value = rawValue.replace(/[^0-9]/g, "");

    if (value.length > 1) {
      const pastedValues = value.slice(0, 6).split("");
      const nextOtp = [...otp];

      pastedValues.forEach((char, charIndex) => {
        if (index + charIndex < 6) {
          nextOtp[index + charIndex] = char;
        }
      });

      setOtp(nextOtp);
      inputRefs.current[Math.min(5, index + pastedValues.length)]?.focus();

      if (nextOtp.join("").length === 6) {
        void verifyOtp(nextOtp.join(""));
      }

      return;
    }

    const nextOtp = [...otp];
    nextOtp[index] = value;
    setOtp(nextOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (nextOtp.join("").length === 6) {
      void verifyOtp(nextOtp.join(""));
    }
  };

  const handleResend = async () => {
    if (!email || countdown > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/forget-password/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        toasts.serverError();
        setIsSubmitting(false);
        return;
      }

      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      setCountdown(60);
      toasts.sent();
      setIsSubmitting(false);
    } catch (error) {
      console.error("[forgot-password:resend]", error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Verify Reset Code</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to {email || "your email"}.
          </p>
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
              maxLength={6}
              className="w-10 text-center"
              value={digit}
              disabled={isSubmitting}
              onChange={(event) => handleOtpChange(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !otp[index] && index > 0) {
                  inputRefs.current[index - 1]?.focus();
                }
              }}
            />
          ))}
        </div>

        <Button
          type="button"
          onClick={() => void verifyOtp(otp.join(""))}
          className="w-full"
          disabled={isSubmitting || otp.join("").length !== 6}
        >
          {isSubmitting ? "Verifying..." : "Verify Code"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={handleResend}
          className="w-full"
          disabled={isSubmitting || countdown > 0}
        >
          {countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
        </Button>
      </div>
    </div>
  );
}
