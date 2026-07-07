import { FileText } from 'lucide-react';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Sastram',
  description: 'Sastram Terms of Service and usage policies.',
};

export default function TermsPage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
          <FileText size={16} />
          <span>Legal</span>
        </div>

        <SerifHeading
          as="h1"
          className="text-4xl md:text-5xl tracking-tight text-foreground mb-6 block"
        >
          Terms of Service
        </SerifHeading>

        <p className="text-lg text-muted-foreground mb-12">Last updated: May 2026</p>

        <div className="space-y-8">
          {[
            {
              title: '1. Acceptance of Terms',
              body: 'By accessing and using Sastram, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to these terms, please do not use our service.',
            },
            {
              title: '2. Use License',
              body: 'Permission is granted to temporarily use Sastram for personal, non-commercial use only. This is the grant of a license, not a transfer of title.',
            },
            {
              title: '3. User Conduct',
              body: 'You agree not to use the service for any unlawful purpose or any purpose otherwise prohibited by these terms. You may not attempt to gain unauthorized access to any part of the service.',
            },
            {
              title: '4. Privacy',
              body: 'Your privacy is important to us. Please review our Privacy Policy, which also governs your use of the service and explains how we collect, use, and protect your information.',
            },
            {
              title: '5. Disclaimer',
              body: 'Sastram is provided "as is" without warranty of any kind, express or implied. We do not guarantee that the service will be uninterrupted or error-free.',
            },
            {
              title: '6. Limitation of Liability',
              body: 'In no event shall Sastram be liable for any indirect, incidental, special, consequential or punitive damages arising out of your use of or inability to use the service.',
            },
          ].map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{section.body}</p>
            </section>
          ))}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">7. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact us at{' '}
              <a href="mailto:support@sastram.com" className="text-brand hover:underline">
                support@sastram.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
