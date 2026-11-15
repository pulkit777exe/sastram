import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Copyright & Takedown Notice — Sastram',
  description: 'Draft notice for reporting copyright concerns, abuse, or policy violations on Sastram.',
};

export default function DmcaPage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
          <ShieldAlert size={16} />
          <span>Copyright & Takedown</span>
        </div>

        <SerifHeading as="h1" className="text-4xl md:text-5xl tracking-tight text-foreground mb-6 block">
          Copyright &amp; Takedown Notice
        </SerifHeading>

        <p className="text-lg text-muted-foreground mb-4">Last updated: November 2026</p>
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-10">
          <strong>Draft notice:</strong> this page provides a good-faith reporting process for transparency and is not legal
          advice and not a substitute for formal legal counsel. Procedures may change as the service is reviewed.
        </p>

        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Report abusive or infringing content</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you believe content on Sastram is abusive, violates policy, or infringes your rights, please report it using
              in-app reporting where available and/or contact the project maintainers. Repeated or credible reports may limit
              public visibility of affected content while moderators review it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Information to include</h2>
            <ul className="list-disc pl-5 text-muted-foreground leading-relaxed space-y-2">
              <li>Links or identifiers for the specific content (thread/message/page) in question.</li>
              <li>A description of why you believe it is abusive, unlawful, or infringing.</li>
              <li>For copyright concerns: enough detail to identify the copyrighted work and your relationship to it.</li>
              <li>Your contact information so we can follow up if needed.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Review and interim actions</h2>
            <p className="text-muted-foreground leading-relaxed">
              Reports are reviewed by moderators/administrators according to available tools and policies. We may restrict
              visibility, remove content, or take account actions where appropriate. Actions are discretionary and based on the
              information available at the time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              To submit a concern, open an issue in the{' '}
              <a
                href="https://github.com/pulkit777exe/sastram/issues"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Sastram repository
              </a>{' '}
              or use the reporting/contact channels provided by this deployment. For security vulnerabilities, follow{' '}
              <a
                href="https://github.com/pulkit777exe/sastram/blob/main/SECURITY.md"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                SECURITY.md
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Related notices</h2>
            <p className="text-muted-foreground leading-relaxed">
              See our <Link href="/terms" className="text-brand hover:underline">Terms of Service</Link>,{' '}
              <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>, and{' '}
              <Link href="/ai-use" className="text-brand hover:underline">AI Use Notice</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
