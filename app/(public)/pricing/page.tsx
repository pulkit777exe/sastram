import { Check } from 'lucide-react';
import Link from 'next/link';
import { getSession } from '@/modules/auth/session';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default async function PricingPage() {
  const session = await getSession();
  const userInitial = session?.user?.name?.[0] || session?.user?.email?.[0] || 'U';

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-foreground">
            Sastram
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {session ? (
              <Link href="/dashboard" className="flex items-center gap-2">
                <Avatar className="h-8 w-8 border-2 border-border">
                  <AvatarImage src={session.user.image || undefined} />
                  <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-12">
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Pricing
            </h1>
            <p className="text-muted-foreground">
              Free to start. $9/mo when you need more. That{`'`}s it.
            </p>
          </div>

          <div className="space-y-4">
            {/* Free Plan */}
            <div className="p-6 rounded-xl border border-border bg-card">
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
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-green-500" />
                  <span>Up to 3 communities</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-green-500" />
                  <span>Standard search</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-green-500" />
                  <span>Basic moderation tools</span>
                </li>
              </ul>
              <Link
                href="/dashboard"
                className="block w-full py-2 px-4 rounded-lg bg-secondary text-center text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                Start Free
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="p-6 rounded-xl border-2 border-brand bg-card">
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
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand" />
                  <span>Unlimited communities</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand" />
                  <span>AI search & suggestions</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand" />
                  <span>Advanced moderation</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand" />
                  <span>Priority support</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={14} className="text-brand" />
                  <span>Custom analytics</span>
                </li>
              </ul>
              <Link
                href="/dashboard"
                className="block w-full py-2 px-4 rounded-lg bg-brand text-center text-sm font-medium text-white hover:bg-brand/90 transition-colors"
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

      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2026 Sastram. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}