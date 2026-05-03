import { FileText } from 'lucide-react';
import Link from 'next/link';
import { getSession } from '@/modules/auth/session';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default async function TermsPage() {
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
            <FileText size={16} />
            <span>Legal</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Terms of Service
          </h1>

          <p className="text-lg text-muted-foreground mb-12">
            Last updated: May 2026
          </p>

          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing and using Sastram, you accept and agree to be bound by the terms and provision of this agreement. 
                If you do not agree to these terms, please do not use our service.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">2. Use License</h2>
              <p className="text-muted-foreground leading-relaxed">
                Permission is granted to temporarily use Sastram for personal, non-commercial use only. 
                This is the grant of a license, not a transfer of title.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">3. User Conduct</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree not to use the service for any unlawful purpose or any purpose otherwise prohibited by these terms. 
                You may not attempt to gain unauthorized access to any part of the service.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">4. Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your privacy is important to us. Please review our Privacy Policy, which also governs your use 
                of the service and explains how we collect, use, and protect your information.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">5. Disclaimer</h2>
              <p className="text-muted-foreground leading-relaxed">
                Sastram is provided &quot;as is&quot; without warranty of any kind, express or implied. 
                We do not guarantee that the service will be uninterrupted or error-free.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">6. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                In no event shall Sastram be liable for any indirect, incidental, special, consequential or punitive damages 
                arising out of your use of or inability to use the service.
              </p>
            </section>

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

      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2026 Sastram. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}