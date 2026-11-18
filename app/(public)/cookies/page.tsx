import { Cookie } from 'lucide-react';
import Link from 'next/link';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Notice — Sastram',
  description: 'Draft notice about cookies and local storage used by Sastram.',
};

export default function CookiesPage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
          <Cookie size={16} />
          <span>Cookies</span>
        </div>

        <SerifHeading as="h1" className="text-4xl md:text-5xl tracking-tight text-foreground mb-6 block">
          Cookie Notice
        </SerifHeading>

        <p className="text-lg text-muted-foreground mb-4">Last updated: November 2026</p>
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-10">
          <strong>Draft notice:</strong> this page describes current product behavior for transparency and is not legal advice.
          It may change as the service and legal review evolve.
        </p>

        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Essential session cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Sastram uses an essential session cookie to keep you signed in, protect your account, and make authenticated
              features work. Without it, sign-in and account-related functionality will not operate correctly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. No advertising or third-party tracking cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not run advertising cookies or third-party tracking cookies for cross-site profiling. Analytics or error
              reporting, when enabled for a deployment, should be described by that deployment&apos;s configuration.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Local browser storage</h2>
            <p className="text-muted-foreground leading-relaxed">
              The app may store limited preferences in your browser (for example, UI settings) so features work as expected on
              your device. This is separate from the essential session cookie.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Related notices</h2>
            <p className="text-muted-foreground leading-relaxed">
              See our <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>,{' '}
              <Link href="/terms" className="text-brand hover:underline">Terms of Service</Link>, and{' '}
              <Link href="/ai-use" className="text-brand hover:underline">AI Use Notice</Link> for related information about
              data handling and service use.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
