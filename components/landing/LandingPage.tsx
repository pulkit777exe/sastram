'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  MessageSquare,
  Users,
  Sparkles,
  Search,
  Bell,
  Bot,
  Shield,
  Globe,
  ChevronRight,
  ArrowRight,
  Zap,
  BarChart3,
  BookOpen,
  TrendingUp,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface LandingPageProps {
  user: User | null;
}

const scrollFeatures = [
  { icon: Users, label: 'Build Communities', color: 'text-blue-500 bg-blue-500/10' },
  { icon: MessageSquare, label: 'Live Threads', color: 'text-purple-500 bg-purple-500/10' },
  { icon: Bot, label: 'AI Replies', color: 'text-green-500 bg-green-500/10' },
  { icon: Search, label: 'Smart Search', color: 'text-amber-500 bg-amber-500/10' },
  { icon: Shield, label: 'Moderation', color: 'text-rose-500 bg-rose-500/10' },
  { icon: Bell, label: 'Notifications', color: 'text-cyan-500 bg-cyan-500/10' },
  { icon: TrendingUp, label: 'Reputation', color: 'text-pink-500 bg-pink-500/10' },
  { icon: BookOpen, label: 'Digests', color: 'text-orange-500 bg-orange-500/10' },
  { icon: BarChart3, label: 'Polls & Votes', color: 'text-violet-500 bg-violet-500/10' },
  { icon: Globe, label: 'Open Communities', color: 'text-teal-500 bg-teal-500/10' },
];

const featureCards = [
  {
    title: 'Build communities',
    description: 'Create organized spaces with sections, tags, and thread metadata for your people.',
    icon: Users,
    accent: '#3736fc',
    cardBg: 'from-blue-500/10 to-indigo-500/5',
    iconBg: 'bg-blue-500',
    illustration: (
      <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500/10 to-blue-900/5 flex items-end p-4 gap-2">
        {['Community A', 'Dev Hub', 'Design'].map((c, i) => (
          <div key={i} className="flex-1 bg-blue-500/20 border border-blue-500/20 rounded-xl p-2 text-[10px] text-blue-500 font-medium truncate">{c}</div>
        ))}
      </div>
    ),
  },
  {
    title: 'Real-time threads',
    description: 'Messages stream live via WebSocket. Reactions and mentions update instantly.',
    icon: Zap,
    accent: '#9333ea',
    cardBg: 'from-purple-500/10 to-violet-500/5',
    iconBg: 'bg-purple-500',
    illustration: (
      <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500/10 to-purple-900/5 flex flex-col justify-end p-4 gap-2">
        {[
          { side: 'left', msg: 'Has anyone tried the new AI search?' },
          { side: 'right', msg: 'Yes! It&apos;s incredible 🔥' },
        ].map((m, i) => (
          <div key={i} className={`flex ${m.side === 'right' ? 'justify-end' : ''}`}>
            <div className={`px-3 py-1.5 rounded-2xl text-[10px] font-medium max-w-[80%] ${m.side === 'right' ? 'bg-purple-500 text-white' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'}`}>
              {m.msg}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'AI synthesis',
    description: 'Thread summaries and smart replies powered by Gemini and OpenAI.',
    icon: Sparkles,
    accent: '#16a34a',
    cardBg: 'from-green-500/10 to-emerald-500/5',
    iconBg: 'bg-green-500',
    illustration: (
      <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-green-500/10 to-green-900/5 flex flex-col justify-center p-4 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-none">
            <Bot size={12} className="text-white" />
          </div>
          <div className="h-2 bg-green-500/30 rounded-full flex-1" />
        </div>
        <div className="space-y-1.5 pl-8">
          <div className="h-2 bg-green-500/20 rounded-full w-full" />
          <div className="h-2 bg-green-500/20 rounded-full w-4/5" />
          <div className="h-2 bg-green-500/20 rounded-full w-3/5" />
        </div>
      </div>
    ),
  },
  {
    title: 'Smart search',
    description: 'AI-enhanced search across threads, messages, and users. Finds what matters.',
    icon: Search,
    accent: '#f59e0b',
    cardBg: 'from-amber-500/10 to-yellow-500/5',
    iconBg: 'bg-amber-500',
    illustration: (
      <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-amber-500/10 to-amber-900/5 flex flex-col justify-center p-4 gap-2">
        <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/20 rounded-xl px-3 py-2">
          <Search size={12} className="text-amber-500" />
          <span className="text-[11px] text-amber-700 dark:text-amber-300">AI search across forums...</span>
        </div>
        {['Best thread on React', 'Moderation guide', 'AI reply features'].map((r, i) => (
          <div key={i} className="flex items-center gap-2 px-2">
            <div className="w-1 h-1 rounded-full bg-amber-500" />
            <div className="text-[10px] text-muted-foreground">{r}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Moderation tools',
    description: 'Rules, reports, appeals, and queues. Keep your community healthy and safe.',
    icon: Shield,
    accent: '#f43f5e',
    cardBg: 'from-rose-500/10 to-pink-500/5',
    iconBg: 'bg-rose-500',
    illustration: (
      <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-rose-500/10 to-rose-900/5 flex flex-col justify-center p-4 gap-2">
        {[
          { label: 'Spam report', status: 'Reviewed', color: 'text-green-500' },
          { label: 'Rule violation', status: 'Pending', color: 'text-amber-500' },
          { label: 'Appeal #42', status: 'Approved', color: 'text-blue-500' },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-rose-500/10 rounded-xl">
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
            <span className={`text-[10px] font-semibold ${item.color}`}>{item.status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Newsletter digests',
    description: 'Daily AI-summarized digests delivered to subscriber inboxes automatically.',
    icon: Globe,
    accent: '#06b6d4',
    cardBg: 'from-cyan-500/10 to-sky-500/5',
    iconBg: 'bg-cyan-500',
    illustration: (
      <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-cyan-500/10 to-cyan-900/5 flex flex-col justify-center p-4 gap-2">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={14} className="text-cyan-500" />
          <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-300">Daily Digest</span>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 bg-cyan-500/25 rounded-full w-full" />
          <div className="h-2 bg-cyan-500/20 rounded-full w-5/6" />
          <div className="h-2 bg-cyan-500/15 rounded-full w-4/6" />
        </div>
        <div className="mt-1 text-[10px] text-cyan-500/70">3 subscribers · sent 2h ago</div>
      </div>
    ),
  },
];

const stats = [
  { value: 'Real-time', label: 'WebSocket threads' },
  { value: 'AI-native', label: 'Gemini & OpenAI' },
  { value: '10+ features', label: 'Out of the box' },
  { value: 'Open', label: 'Community-first' },
];

export function LandingPage({ user }: LandingPageProps) {
  const userInitial = user?.name?.[0] || user?.email?.[0] || 'U';
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt="Sastram"
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="font-bold text-lg tracking-tight">Sastram</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard" className="flex items-center gap-2">
                <Avatar className="h-8 w-8 border-2 border-border">
                  <AvatarImage src={user.image || undefined} />
                  <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-semibold px-5 py-2 bg-foreground text-background rounded-full hover:opacity-90 transition-all hover:scale-[1.03] shadow-lg"
                >
                  Try Sastram →
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="pt-44 pb-24 px-6 text-center relative overflow-hidden">
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-brand/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-32 left-1/4 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-32 right-1/4 w-64 h-64 bg-pink-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-4xl mx-auto">
            <div className="flex justify-center mb-8">
              <Image src="/logo.svg" alt="Sastram" width={68} height={68} className="rounded-2xl shadow-2xl shadow-brand/20" />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand/25 bg-brand/5 text-brand text-sm font-medium mb-8">
              <Sparkles size={13} />
              <span>AI-Powered Forum Platform</span>
            </div>

            <h1 className="text-5xl md:text-[72px] font-bold text-foreground mb-6 leading-[1.08] tracking-tight">
              Discuss anything.
              <br />
              <span className="bg-gradient-to-r from-brand via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Powered by AI.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Sastram is the modern forum where communities thrive. Real-time threads, AI synthesis,
              smart moderation — all in one beautifully crafted platform.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="px-9 py-4 bg-foreground text-background font-semibold rounded-full hover:opacity-90 transition-all hover:scale-[1.03] shadow-2xl shadow-foreground/15 flex items-center gap-2 text-[15px]"
              >
                Get started free
                <ArrowRight size={17} />
              </Link>
              <Link
                href="#features"
                className="px-9 py-4 border border-border text-foreground font-medium rounded-full hover:bg-secondary transition-all hover:scale-[1.02] flex items-center gap-2 text-[15px]"
              >
                Explore features
                <ChevronRight size={17} />
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="flex -space-x-2">
                {['#3736fc', '#9333ea', '#16a34a', '#f59e0b'].map((c, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-background"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <span>Join communities already on Sastram</span>
            </div>
          </div>
        </section>

        {/* Scrolling Feature Strip */}
        <section className="py-6 overflow-hidden border-y border-border bg-secondary/20">
          <div className="landing-marquee">
            <div className="landing-marquee-track">
              {[...scrollFeatures, ...scrollFeatures].map((f, i) => (
                <div
                  key={i}
                  className="flex-none mx-3 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-background border border-border shadow-sm hover:border-brand/30 transition-colors cursor-default"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-none ${f.color}`}>
                    <f.icon size={16} />
                  </div>
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-28 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-5 leading-tight tracking-tight">
                Build communities.{' '}
                <br className="hidden sm:block" />
                <em className="not-italic bg-gradient-to-r from-brand to-purple-500 bg-clip-text text-transparent">
                  Talk about everything.
                </em>
              </h2>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Sastram is always ready to help your community think, connect, and grow — with AI at the core.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {featureCards.map((card, i) => (
                <div
                  key={i}
                  className="group relative bg-card border border-border rounded-3xl overflow-hidden hover:border-brand/25 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-brand/5 cursor-default"
                >
                  <div className="p-6">
                    <div
                      className={`w-10 h-10 ${card.iconBg} rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}
                    >
                      <card.icon size={19} />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2 text-[15px]">{card.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">{card.description}</p>
                    {card.illustration}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Strip */}
        <section className="py-20 px-6 border-y border-border bg-secondary/20">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {stats.map((s, i) => (
              <div key={i} className="space-y-2">
                <div className="text-2xl md:text-3xl font-bold text-foreground">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-36 px-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-brand/5 rounded-full blur-3xl" />
            <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
          </div>
          <div className="relative max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand/25 bg-brand/5 text-brand text-sm font-medium mb-8">
              <Sparkles size={13} />
              <span>Free to get started</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight tracking-tight">
              Ready to start your
              <br />
              <span className="bg-gradient-to-r from-brand via-purple-500 to-pink-500 bg-clip-text text-transparent">
                community?
              </span>
            </h2>
            <p className="text-lg text-muted-foreground mb-12 max-w-xl mx-auto leading-relaxed">
              Join Sastram today and experience the future of online discussion — smarter, faster, and more human.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="px-10 py-4 bg-foreground text-background font-semibold rounded-full hover:opacity-90 transition-all hover:scale-[1.03] shadow-2xl shadow-foreground/15 flex items-center gap-2 text-[15px]"
              >
                Create your community
                <ArrowRight size={17} />
              </Link>
              <Link
                href="/pricing"
                className="px-10 py-4 border border-border text-foreground font-medium rounded-full hover:bg-secondary transition-all hover:scale-[1.02] flex items-center gap-2 text-[15px]"
              >
                View pricing
                <ChevronRight size={17} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Sastram" width={22} height={22} className="rounded-md" />
            <span className="font-semibold text-foreground">Sastram</span>
          </div>
          <div className="flex items-center gap-8 text-sm text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 Sastram. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
