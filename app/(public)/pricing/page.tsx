import {
  Check,
  Sparkles,
  Zap,
  MessageSquare,
  Shield,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const features = [
  { icon: Sparkles, text: "AI-powered replies & suggestions" },
  { icon: Zap, text: "Priority message delivery" },
  { icon: MessageSquare, text: "Unlimited thread creation" },
  { icon: Shield, text: "Advanced moderation tools" },
  { icon: Crown, text: "Exclusive Pro badge" },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-foreground">
            Sastram
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
            <Sparkles size={16} />
            <span>Upgrade to Pro</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Unlock the full power of{" "}
            <span className="bg-linear-to-r from-brand via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Sastram
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12">
            Get access to AI-powered features, priority support, and exclusive
            tools designed to supercharge your discussions.
          </p>

          <div className="max-w-md mx-auto">
            <div className="relative bg-card border border-border rounded-3xl p-8 shadow-2xl shadow-brand/5 overflow-hidden">
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-brand/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />

              <div className="relative">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-linear-to-r from-brand to-purple-500 text-white text-xs font-semibold mb-6">
                  <Crown size={12} />
                  Most Popular
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Pro Plan
                </h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Everything you need for power users
                </p>

                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-5xl font-bold text-foreground">$9</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-4 mb-8 text-left">
                  {features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
                        <feature.icon size={16} className="text-brand" />
                      </div>
                      <span className="text-foreground text-sm">
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button className="w-full py-4 px-6 bg-linear-to-r from-brand to-purple-500 hover:from-brand/90 hover:to-purple-500/90 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30 hover:-translate-y-0.5">
                  Get Started with Pro
                </button>

                <p className="text-xs text-muted-foreground mt-4">
                  Cancel anytime. No questions asked.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-16 max-w-md mx-auto">
            <div className="bg-muted/50 border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Free Plan</h3>
              <ul className="space-y-3 text-left text-sm text-muted-foreground">
                <li className="flex items-center gap-3">
                  <Check size={16} className="text-green-500" />
                  <span>Basic thread participation</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check size={16} className="text-green-500" />
                  <span>Up to 3 threads created</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check size={16} className="text-green-500" />
                  <span>Standard support</span>
                </li>
              </ul>
              <Link
                href="/dashboard"
                className="block mt-6 w-full py-3 px-6 bg-secondary hover:bg-secondary/80 text-foreground font-medium rounded-xl text-center transition-colors"
              >
                Continue with Free
              </Link>
            </div>
          </div>
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
