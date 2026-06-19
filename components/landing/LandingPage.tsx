'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  MessageSquare,
  Users,
  Sparkles,
  Search,
  Shield,
  Bell,
  Bot,
  ArrowRight,
  ChevronRight,
  BookOpen,
  BarChart3,
  Globe,
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

const capabilities = [
  { icon: Users, label: 'Communities', color: 'text-blue-500' },
  { icon: MessageSquare, label: 'Real-time Threads', color: 'text-purple-500' },
  { icon: Bot, label: 'AI @-mentions', color: 'text-green-500' },
  { icon: Sparkles, label: 'AI Search', color: 'text-amber-500' },
  { icon: Shield, label: 'Moderation', color: 'text-rose-500' },
  { icon: BarChart3, label: 'Polls & Votes', color: 'text-violet-500' },
  { icon: Bell, label: 'Notifications', color: 'text-cyan-500' },
  { icon: BookOpen, label: 'Daily Digests', color: 'text-orange-500' },
];

const features = [
  {
    icon: MessageSquare,
    title: 'Real-time threaded discussions',
    description:
      'Every message streams live via WebSocket. No refresh, no polling. Reactions, edits, and mentions appear instantly.',
    color: 'text-purple-500',
    bg: 'bg-purple-500/8',
    border: 'border-purple-500/15',
  },
  {
    icon: Bot,
    title: 'Type @ai, get an answer',
    description:
      'Mention @ai in any thread and get a streaming response posted directly into the conversation. No context switching.',
    color: 'text-green-500',
    bg: 'bg-green-500/8',
    border: 'border-green-500/15',
  },
  {
    icon: Search,
    title: 'AI-powered forum search',
    description:
      'Search across threads, messages, and users. The AI synthesizes results and ranks by relevance.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/15',
  },
  {
    icon: Shield,
    title: 'Built-in moderation',
    description:
      'Rules engine with regex and AI-powered content filtering. Reports, appeals, bans, and moderation queues.',
    color: 'text-rose-500',
    bg: 'bg-rose-500/8',
    border: 'border-rose-500/15',
  },
  {
    icon: Globe,
    title: 'AI daily digests',
    description:
      'Subscribers get a daily newsletter summarizing the best threads. AI-generated summaries that people actually read.',
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/8',
    border: 'border-cyan-500/15',
  },
  {
    icon: TrendingUp,
    title: 'Reputation and badges',
    description:
      'Earn reputation points and badges. Resolution scores track how resolved a discussion is.',
    color: 'text-pink-500',
    bg: 'bg-pink-500/8',
    border: 'border-pink-500/15',
  },
];

const steps = [
  {
    step: '01',
    title: 'Create a community',
    description: 'Organize threads by topic. Add sections, tags, and invite people.',
    icon: Users,
  },
  {
    step: '02',
    title: 'Start a thread',
    description: 'Post a question, share research, or kick off a discussion with nested replies and polls.',
    icon: MessageSquare,
  },
  {
    step: '03',
    title: 'Let AI do the heavy lifting',
    description: 'Summarize threads, search with AI, get @ai answers inline. The pipeline runs in the background.',
    icon: Sparkles,
  },
];

function FadeIn({
  children,
  className = '',
  delay = 0,
  y = 20,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggerChildren({
  children,
  className = '',
  stagger = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggerItem({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function LandingPage({ user }: LandingPageProps) {
  const userInitial = user?.name?.[0] || user?.email?.[0] || 'U';
  const { theme } = useTheme();
  const videoSrc = theme === 'dark' ? '/Sastram-Dark.mp4' : '/Sastram-Light.mp4';

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Sastram" width={24} height={24} className="rounded-lg" />
            <span className="font-semibold text-foreground tracking-tight">Sastram</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            <Link href="#features" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              How it works
            </Link>
            <Link href="/pricing" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard" className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.image || undefined} />
                  <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">{userInitial}</AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block px-3 py-1.5">
                  Sign in
                </Link>
                <Link href="/login" className="text-[13px] font-medium px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-all">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="pt-32 pb-16 px-6">
          <div className="max-w-5xl mx-auto text-center">
            <FadeIn>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-muted/50 text-xs font-medium text-muted-foreground mb-8">
                <Sparkles size={11} />
                AI-powered discussion platform
              </div>
            </FadeIn>

            <FadeIn delay={0.08}>
              <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-5 leading-[1.1] tracking-tight max-w-3xl mx-auto">
                Your forum, but with
                <br />
                real intelligence
              </h1>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
                Real-time threaded discussions with AI built into the core.
                Summarize threads, get inline answers, search intelligently,
                and moderate automatically.
              </p>
            </FadeIn>

            <FadeIn delay={0.24}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="px-7 py-3 bg-foreground text-background font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm"
                >
                  Start for free
                  <ArrowRight size={15} />
                </Link>
                <Link
                  href="#features"
                  className="px-7 py-3 border border-border text-foreground font-medium rounded-lg hover:bg-muted transition-all flex items-center gap-2 text-sm"
                >
                  See features
                  <ChevronRight size={15} />
                </Link>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Demo Video */}
        <FadeIn className="px-6 pb-24" y={30}>
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xl shadow-black/5 dark:shadow-black/30">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-auto"
                poster="/logo.svg"
              >
                <source src={videoSrc} type="video/mp4" suppressHydrationWarning />
              </video>
            </div>
          </div>
        </FadeIn>

        {/* Capabilities strip */}
        <section className="py-5 border-y border-border/50 bg-muted/20 overflow-hidden">
          <StaggerChildren className="flex items-center justify-center gap-6 md:gap-10 px-6 flex-wrap" stagger={0.04}>
            {capabilities.map((c, i) => (
              <StaggerItem key={i}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <c.icon size={14} className={c.color} />
                  <span className="whitespace-nowrap text-[13px]">{c.label}</span>
                </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <FadeIn className="mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
                What you get
              </h2>
              <p className="text-base text-muted-foreground max-w-lg leading-relaxed">
                Everything a modern community needs, plus AI capabilities that
                actually help people find answers faster.
              </p>
            </FadeIn>

            <StaggerChildren className="grid grid-cols-1 md:grid-cols-2 gap-4" stagger={0.07}>
              {features.map((f, i) => (
                <StaggerItem key={i}>
                  <div
                    className={`group h-full p-6 rounded-xl border ${f.border} ${f.bg} hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-9 h-9 rounded-lg ${f.bg} border ${f.border} flex items-center justify-center flex-none transition-transform duration-300 group-hover:scale-110`}
                      >
                        <f.icon size={17} className={f.color} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground mb-1.5 text-[15px]">{f.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-24 px-6 border-t border-border/50 bg-muted/10">
          <div className="max-w-4xl mx-auto">
            <FadeIn className="mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
                How it works
              </h2>
              <p className="text-base text-muted-foreground max-w-lg leading-relaxed">
                Three steps from zero to an active community with AI-powered discussions.
              </p>
            </FadeIn>

            <StaggerChildren className="space-y-6" stagger={0.12}>
              {steps.map((s, i) => (
                <StaggerItem key={i}>
                  <div className="flex gap-5 p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
                    <div className="flex-none">
                      <div className="w-10 h-10 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-sm">
                        {s.step}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <s.icon size={16} className="text-muted-foreground" />
                        <h3 className="font-semibold text-foreground text-[15px]">{s.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </div>
        </section>

        {/* Stats */}
        <section className="py-20 px-6 border-t border-border/50">
          <div className="max-w-4xl mx-auto">
            <StaggerChildren className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center" stagger={0.08}>
              {[
                { value: 'Live', label: 'WebSocket threads' },
                { value: 'AI-native', label: 'Gemini & OpenAI' },
                { value: '10+', label: 'Built-in features' },
                { value: 'Free', label: 'To get started' },
              ].map((s, i) => (
                <StaggerItem key={i}>
                  <div>
                    <div className="text-xl font-bold text-foreground mb-1">{s.value}</div>
                    <div className="text-[13px] text-muted-foreground">{s.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-28 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <FadeIn>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
                Build your community
              </h2>
              <p className="text-base text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                Free to start. Real-time threads, AI synthesis, smart moderation.
                No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="px-7 py-3 bg-foreground text-background font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm"
                >
                  Get started free
                  <ArrowRight size={15} />
                </Link>
                <Link
                  href="/pricing"
                  className="px-7 py-3 border border-border text-foreground font-medium rounded-lg hover:bg-muted transition-all text-sm"
                >
                  View pricing
                </Link>
              </div>
            </FadeIn>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Sastram" width={18} height={18} className="rounded" />
            <span className="font-semibold text-sm text-foreground">Sastram</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
          <p className="text-[13px] text-muted-foreground">&copy; 2026 Sastram</p>
        </div>
      </footer>
    </div>
  );
}
