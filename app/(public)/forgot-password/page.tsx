"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toasts } from "@/lib/utils/toast";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

      toasts.sent();
      router.push(
        `/forgot-password/verify?email=${encodeURIComponent(email)}`,
      );
    } catch (error) {
      console.error("[forgot-password:request]", error);
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
          <h1 className="text-xl font-semibold">Forgot Password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send a 6-digit reset code.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            placeholder="name@example.com"
          />
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting || !email}>
          {isSubmitting ? "Sending..." : "Send Reset Code"}
        </Button>
      </form>
    </div>
  );
}
