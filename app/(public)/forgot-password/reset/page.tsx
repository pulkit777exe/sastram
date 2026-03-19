"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toasts } from "@/lib/utils/toast";

function hasNumber(value: string) {
  return /\d/.test(value);
}

function hasSpecial(value: string) {
  return /[^A-Za-z0-9]/.test(value);
}

export default function ForgotPasswordResetPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedEmail = window.sessionStorage.getItem("forgot_password_email");
    const storedOtp = window.sessionStorage.getItem("forgot_password_otp");

    if (!storedEmail || !storedOtp) {
      router.replace("/forgot-password");
      return;
    }

    setEmail(storedEmail);
    setOtp(storedOtp);
  }, [router]);

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
      toasts.error("Please fix password validation issues.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/email-otp/reset-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, password }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        const message = result?.error?.message || result?.error || "Password reset failed";
        if (/expired/i.test(message)) {
          toasts.otpExpired();
        } else {
          toasts.error("Failed to reset password.", message);
        }

        setIsSubmitting(false);
        return;
      }

      window.sessionStorage.removeItem("forgot_password_email");
      window.sessionStorage.removeItem("forgot_password_otp");

      toasts.success("Password updated. Please sign in.");
      router.replace("/login");
    } catch (error) {
      console.error("[forgot-password:reset]", error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Set New Password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a strong password for {email || "your account"}.
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
          />
        </div>

        <div className="rounded-md border border-border p-3 text-xs space-y-1 text-muted-foreground">
          <p className={validation.minLength ? "text-emerald-500" : ""}>
            Minimum 8 characters
          </p>
          <p className={validation.includesNumber ? "text-emerald-500" : ""}>
            At least one number
          </p>
          <p className={validation.includesSpecial ? "text-emerald-500" : ""}>
            At least one special character
          </p>
          <p className={validation.matches ? "text-emerald-500" : ""}>
            Passwords match
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting || !validation.valid}>
          {isSubmitting ? "Updating..." : "Update Password"}
        </Button>
      </form>
    </div>
  );
}
