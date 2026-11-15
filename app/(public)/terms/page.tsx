import { FileText } from 'lucide-react';
import Link from 'next/link';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Sastram',
  description: 'Draft terms of service and usage policies for Sastram.',
};

interface TermsSection {
  title: string;
  body: string;
  link?: { href: string; label: string };
}

const TERMS_SECTIONS: TermsSection[] = [
  {
    title: '1. Acceptance of Terms',
    body: 'By accessing and using Sastram, you agree to these terms. If you do not agree, do not use the service.',
  },
  {
    title: '2. Your Account',
    body: 'You are responsible for the activity on your account and for keeping your credentials secure. You must provide accurate information and be old enough to use the service in your jurisdiction.',
  },
  {
    title: '3. Your Content',
    body: 'You keep ownership of the threads, messages, and other content you post. You grant Sastram the permission needed to host, display, and process that content so the service can operate — for example, to render a thread or generate a summary you requested.',
  },
  {
    title: '4. Acceptable Use and Reporting',
    body: 'Do not use Sastram for unlawful purposes, to harass others, to post spam or malware, or to attempt to gain unauthorized access to any part of the service. You can report content or behavior that appears abusive or policy-violating; moderators may review reports, restrict public visibility of reported content while under review, remove content, or restrict accounts where appropriate.',
  },
  {
    title: '5. AI Features',
    body: 'AI-generated summaries, search answers, and @sai replies can be incomplete or wrong. They are aids for your research, not a substitute for your own judgment. You are responsible for how you use them.',
  },
  {
    title: '6. Open Source',
    body: 'The Sastram source code is available under the MIT License. These terms govern the hosted service; the license governs your use of the code.',
  },
  {
    title: '7. Availability and Changes',
    body: 'Sastram is provided as-is and may change, be interrupted, or be discontinued. We may update these terms; continued use after an update means you accept the revised terms.',
  },
  {
    title: '8. Privacy, Cookies, and AI Use',
    body: 'Our draft Privacy Policy, Cookie Notice, and AI Use Notice explain what we collect, how we use it, how cookies/sessions work, and how AI features handle content. You can export or delete your data from account settings where available.',
  },
  {
    title: '9. Disclaimers and Liability',
    body: 'Sastram is provided without warranties of any kind. To the extent permitted by law, Sastram is not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service.',
  },
];

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

        <p className="text-lg text-muted-foreground mb-4">Last updated: November 2026</p>
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-10">
          <strong>Draft notice:</strong> these terms are provided for transparency and are not legal advice. They may change as the
          service and legal review evolve. Related drafts: <Link href="/privacy" className="underline">Privacy Policy</Link>,{' '}
          <Link href="/cookies" className="underline">Cookie Notice</Link>,{' '}
          <Link href="/ai-use" className="underline">AI Use Notice</Link>, and{' '}
          <Link href="/dmca" className="underline">Copyright &amp; Takedown</Link>.
        </p>

        <div className="space-y-8">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {section.body}
                {section.link ? (
                  <>
                    {' '}
                    <Link href={section.link.href} className="text-brand hover:underline">
                      {section.link.label}
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            </section>
          ))}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these terms? Open an issue in the{' '}
              <a
                href="https://github.com/pulkit777exe/sastram/issues"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Sastram repository
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
