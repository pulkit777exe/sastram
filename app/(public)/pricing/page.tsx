import { Check } from 'lucide-react';
import Link from 'next/link';
import { SerifHeading } from '@/components/layout/serif-heading';

export default function PricingPage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12">
          <SerifHeading as="h1" className="text-3xl md:text-4xl tracking-tight text-foreground mb-3 block">
            Pricing
          </SerifHeading>
          <p className="text-muted-foreground">
            Free to start. $9/mo when you need more. That&apos;s it.
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Free</h2>
                <p className="text-muted-foreground text-sm">For trying things out</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-foreground">$0</span>
                <p className="text-muted-foreground text-xs">forever</p>
              </div>
            </div>
            <ul className="space-y-2 mb-4">
              {['Up to 3 communities', 'Standard search', 'Basic moderation tools'].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-green-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              className="block w-full py-2.5 px-4 rounded-lg bg-secondary text-center text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
            >
              Start Free
            </Link>
          </div>

          <div className="p-6 rounded-2xl border-2 border-brand bg-card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Pro</h2>
                <p className="text-muted-foreground text-sm">For people who use it daily</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-foreground">$9</span>
                <p className="text-muted-foreground text-xs">per month</p>
              </div>
            </div>
            <ul className="space-y-2 mb-4">
              {[
                'Unlimited communities',
                'AI search & suggestions',
                'Advanced moderation',
                'Priority support',
                'Custom analytics',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              className="block w-full py-2.5 px-4 rounded-lg bg-brand text-center text-sm font-medium text-white hover:bg-brand/90 transition-colors"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Cancel anytime. No questions asked.
        </p>
      </div>
    </main>
  );
}
