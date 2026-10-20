import { Check, Code2 } from 'lucide-react';
import Link from 'next/link';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Sastram',
  description: 'Sastram is free to use and open source under the MIT License. No paid tiers.',
};

const included = [
  'Threaded discussions with public, restricted, and private visibility',
  'Sai @-mentions and cited AI search',
  'Polls, bookmarks, follows, and thread subscriptions',
  'Moderation: rules, reports, appeals, and bans',
  'Email digests and thread invitations',
  'Open source under the MIT License',
];

export default function PricingPage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12">
          <SerifHeading as="h1" className="text-3xl md:text-4xl tracking-tight text-foreground mb-3 block">
            Pricing
          </SerifHeading>
          <p className="text-muted-foreground">
            Sastram is free to use. There is no paid tier today.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 rounded-card border-2 border-brand bg-surface flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Free</h2>
                <p className="text-muted-foreground text-sm">Everything Sastram offers</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-foreground">$0</span>
                <p className="text-muted-foreground text-xs">no card required</p>
              </div>
            </div>
            <ul className="space-y-2 mb-6">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand mt-0.5 flex-none" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-auto block w-full py-2.5 px-4 rounded-control bg-brand text-center text-sm font-medium text-white hover:bg-brand/90 transition-colors"
            >
              Get started
            </Link>
          </div>

          <div className="p-6 rounded-card border border-line bg-surface flex flex-col">
            <div className="w-9 h-9 rounded-control bg-brand/10 text-brand flex items-center justify-center mb-4">
              <Code2 size={18} />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Self-host it</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Sastram is open source under the MIT License. Run it on your own infrastructure and
              bring your own model provider keys.
            </p>
            <a
              href="https://github.com/pulkit777exe/sastram"
              target="_blank"
              rel="noreferrer"
              className="mt-auto block w-full py-2.5 px-4 rounded-control bg-secondary text-center text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
            >
              View source
            </a>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          If a paid plan is added later, this page will say so before you are ever charged.
        </p>
      </div>
    </main>
  );
}
