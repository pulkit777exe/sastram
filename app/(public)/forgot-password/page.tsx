'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toasts } from '@/lib/utils/toast';
import { SerifHeading } from '@/components/layout/serif-heading';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

      toasts.sent();
      router.push(`/forgot-password/verify?email=${encodeURIComponent(email)}`);
    } catch (error) {
      console.error('[forgot-password:request]', error);
      toasts.networkError();
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center py-16 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8 space-y-5 shadow-sm"
      >
        <div className="space-y-1">
          <SerifHeading as="h1" className="text-2xl tracking-tight block">
            Forgot Password
          </SerifHeading>
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
            className="h-11 rounded-xl"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isSubmitting || !email}
        >
          {isSubmitting ? 'Sending...' : 'Send Reset Code'}
        </Button>
      </form>
    </main>
  );
}
