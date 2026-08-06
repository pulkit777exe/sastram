'use client';

import { useState } from 'react';
import { LoginForm } from '@/components/auth';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';
import Link from 'next/link';
import { ArrowRight, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function LoginPageClient() {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
      <aside className="relative hidden overflow-hidden bg-[#0d0d12] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(91,90,248,.35), transparent 32%), radial-gradient(circle at 80% 80%, rgba(61,214,140,.14), transparent 28%)' }} />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"><Logo brand className="h-6 w-6" /> Sastram</Link>
        </div>
        <div className="relative max-w-lg">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">A calmer place to think together</p>
          <h1 className="text-4xl font-medium leading-tight tracking-[-0.03em]">Turn scattered conversations into shared understanding.</h1>
          <div className="mt-10 space-y-4 text-sm text-white/65">
            <div className="flex items-center gap-3"><MessageSquare className="h-4 w-4 text-brand" /> Live threads</div>
            <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-brand" /> Sai-powered synthesis</div>
            <div className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-brand" /> Thoughtful by default</div>
          </div>
        </div>
        <p className="relative text-xs text-white/35">Open source · Built for meaningful discussions</p>
      </aside>
      <section className="relative flex min-h-screen flex-col">
        <div className="flex items-center justify-between p-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight lg:hidden"><Logo brand className="h-5 w-5" /> Sastram</Link>
          <Link href="/" className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Back to home <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <LoginForm
          onForgotPassword={() => setShowForgotPassword(true)}
          onEmailChange={setEmail}
        />
      </section>
      <ForgotPasswordModal
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
        initialEmail={email}
      />
    </div>
  );
}
