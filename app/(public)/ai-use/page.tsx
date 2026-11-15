import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Use Notice — Sastram',
  description: 'Draft notice about how Sastram uses AI features and handles AI-related inputs.',
};

export default function AiUsePage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
          <Sparkles size={16} />
          <span>AI Use</span>
        </div>

        <SerifHeading as="h1" className="text-4xl md:text-5xl tracking-tight text-foreground mb-6 block">
          AI Use Notice
        </SerifHeading>

        <p className="text-lg text-muted-foreground mb-4">Last updated: November 2026</p>
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-10">
          <strong>Draft notice:</strong> this page describes current AI-related behavior for transparency and is not legal advice.
          AI outputs are not authoritative; verify important claims.
        </p>

        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Optional AI features</h2>
            <p className="text-muted-foreground leading-relaxed">
              Sastram may offer optional AI features such as @sai replies, AI search, summaries, and related assistance. If you
              do not invoke these features, your content is not sent to AI providers for AI processing by those features.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. What may be sent to providers</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use an AI feature, relevant prompts, thread context, or search queries may be sent to the model and/or
              search providers configured for this deployment (for example, model providers such as Google Gemini/OpenAI and
              search providers such as Exa/Tavily, depending on configuration). Provider processing is subject to their terms and
              policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Accuracy and responsibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              AI-generated content can be incomplete, outdated, or incorrect. Scores, summaries, and extracted claims shown in the
              product are estimates or aids, not guarantees. You are responsible for reviewing and verifying information before
              relying on it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Community verification</h2>
            <p className="text-muted-foreground leading-relaxed">
              Sastram encourages community review and verification of AI-assisted answers. Trust signals and explanations are
              provided to help you understand confidence, recency, and review state—not to replace human judgment.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Related notices</h2>
            <p className="text-muted-foreground leading-relaxed">
              See our <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>,{' '}
              <Link href="/cookies" className="text-brand hover:underline">Cookie Notice</Link>, and{' '}
              <Link href="/terms" className="text-brand hover:underline">Terms of Service</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
