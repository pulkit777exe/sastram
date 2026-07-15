import Link from 'next/link';
import {
  MessageSquare,
  Users,
  Sparkles,
  Search,
  Shield,
  ArrowRight,
  ChevronRight,
  Zap,
  Lock,
  UserCheck,
} from 'lucide-react';
import { PublicNavbar } from '@/components/layout/public-navbar';
import { PublicFooter } from '@/components/layout/public-footer';
import { SerifHeading } from '@/components/layout/serif-heading';
import { FadeIn } from '@/components/landing/FadeIn';
import { ThemeVideo } from '@/components/landing/LandingMedia';

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
  'Real-time threads',
  'AI @-mentions',
  'Forum search',
  'Moderation',
  'Polls & votes',
  'Daily digests',
  'Reputation',
  'WebSockets',
];

const featureRows = [
  {
    title: 'Every reply streams live, instantly',
    description:
      'WebSocket-powered threads with reactions, edits, and mentions that appear without a refresh. No polling, no stale state.',
    link: '#features',
    tag: 'Real-time',
    visual: 'threads' as const,
    quote: {
      source: 'Built-in',
      text: 'Messages, reactions, and read receipts sync across every connected client in milliseconds.',
    },
  },
  {
    title: 'Type @sai, get answers in-thread',
    description:
      'Mention @sai in any discussion and receive a streaming response posted directly into the conversation. No tab switching.',
    link: '#features',
    tag: 'AI-native',
    visual: 'ai' as const,
    quote: {
      source: 'Gemini & OpenAI',
      text: 'Thread summaries, DNA analysis, resolution scores, and inline replies — all powered by your choice of model.',
    },
  },
  {
    title: 'Search, summarize, and moderate in one platform',
    description:
      'AI forum search synthesizes results across threads. Background jobs generate summaries and digests while moderation runs automatically.',
    link: '#features',
    tag: 'Intelligence',
    visual: 'search' as const,
    quote: {
      source: 'Background jobs',
      text: 'QStash handles thread summaries, conflict detection, and daily digests serverlessly without blocking your users.',
    },
  },
];

const metrics = [
  { label: 'Real-time delivery', sastram: 98, others: 42 },
  { label: 'AI integration depth', sastram: 95, others: 35 },
  { label: 'Moderation coverage', sastram: 90, others: 50 },
];

const securityFeatures = [
  {
    icon: Shield,
    title: 'Built-in moderation',
    description: 'Regex rules, AI content filtering, reports, appeals, and ban management out of the box.',
  },
  {
    icon: Lock,
    title: 'Membership-scoped access',
    description: 'Every route enforces SectionMember checks. Communities are private by default.',
  },
  {
    icon: UserCheck,
    title: 'Better Auth',
    description: 'Email OTP, OAuth, and session management with industry-standard security practices.',
  },
];

const useCases = [
  {
    type: 'quote' as const,
    source: 'Research teams',
    quote:
      'Organize long-form discussions with thread DNA, resolution scores, and AI summaries that capture what was actually decided.',
    author: 'Thread intelligence',
  },
  {
    type: 'stat' as const,
    label: '50+ feature modules',
    sublabel: 'Communities, polls, badges, bookmarks, and more',
  },
  {
    type: 'image' as const,
    title: 'Powering the next generation of community discussions',
    subtitle: 'Open source · Self-hostable',
  },
];

function MosaicTile({ className }: { className?: string }) {
  return (
    <div
      className={`absolute rounded-sm opacity-60 blur-[0.5px] ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(135deg, var(--brand) 0%, #5b5af8 40%, var(--green) 70%, var(--brand) 100%)',
      }}
    />
  );
}

function DashboardPreview() {
  const threads = [
    { name: 'Optimizing RAG pipelines', replies: 24, tag: 'AI', active: true },
    { name: 'WebSocket scaling strategies', replies: 18, tag: 'Infra' },
    { name: 'Thread resolution scoring', replies: 31, tag: 'Product' },
    { name: 'Community moderation patterns', replies: 12, tag: 'Mod' },
  ];

  return (
    <div className="w-full bg-background rounded-xl border border-border shadow-linear-xl overflow-hidden text-left">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/80">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex-1 mx-4">
          <div className="h-7 bg-background border border-border rounded-md flex items-center px-3 gap-2">
            <Search size={12} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Search threads, messages, users…</span>
          </div>
        </div>
      </div>
      <div className="flex min-h-[280px]">
        <div className="w-44 border-r border-border bg-muted/50 p-3 hidden sm:block">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Communities
          </p>
          {['Engineering', 'Research', 'General'].map((c, i) => (
            <div
              key={c}
              className={`text-[11px] px-2 py-1.5 rounded-md mb-0.5 ${i === 0 ? 'bg-brand/10 text-brand font-medium' : 'text-muted-foreground'}`}
            >
              {c}
            </div>
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold text-foreground">Recent threads</p>
            <span className="text-[10px] text-emerald-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="space-y-1.5">
            {threads.map((t) => (
              <div
                key={t.name}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-[11px] ${t.active ? 'border-brand/20 bg-brand/5' : 'border-border bg-background'}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{t.name}</p>
                  <p className="text-muted-foreground mt-0.5">{t.replies} replies</p>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-2 flex-none">
                  {t.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureVisual({ type }: { type: 'threads' | 'ai' | 'search' }) {
  if (type === 'threads') {
    return (
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-brand/20 via-brand/5 to-emerald-500/10 p-6">
        <div className="absolute inset-0 opacity-30">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-8 h-8 rounded-md bg-brand/20"
              style={{
                left: `${(i % 4) * 25 + 5}%`,
                top: `${Math.floor(i / 4) * 30 + 10}%`,
                transform: `rotate(${i * 15}deg)`,
              }}
            />
          ))}
        </div>
        <div className="relative bg-background/90 backdrop-blur rounded-xl border border-white/60 p-4 shadow-linear-lg">
          <div className="space-y-2">
            {['How do we handle concurrent edits?', 'WebSocket reconnect logic?'].map((msg, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-brand/20 flex-none" />
                <div className="bg-muted rounded-lg px-3 py-2 text-[11px] text-foreground/80 flex-1">
                  {msg}
                </div>
              </div>
            ))}
            <div className="flex gap-2 items-start justify-end">
              <div className="bg-brand text-white rounded-lg px-3 py-2 text-[11px]">
                Streaming reply…
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'ai') {
    return (
      <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-950 p-5 font-mono text-[10px] leading-relaxed">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/80" />
            <div className="w-2 h-2 rounded-full bg-amber-500/80" />
            <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-muted-foreground text-[9px]">@sai mention handler</span>
        </div>
        <pre className="text-zinc-300 overflow-hidden">
          <span className="text-muted-foreground">{'{'}</span>
          {'\n'}
          {'  '}
          <span className="text-emerald-400">&quot;mention&quot;</span>
          <span className="text-muted-foreground">: </span>
          <span className="text-amber-300">&quot;@sai&quot;</span>
          <span className="text-muted-foreground">,</span>
          {'\n'}
          {'  '}
          <span className="text-emerald-400">&quot;thread&quot;</span>
          <span className="text-muted-foreground">: </span>
          <span className="text-amber-300">&quot;rag-pipelines&quot;</span>
          <span className="text-muted-foreground">,</span>
          {'\n'}
          {'  '}
          <span className="text-emerald-400">&quot;streaming&quot;</span>
          <span className="text-muted-foreground">: </span>
          <span className="text-brand">true</span>
          <span className="text-muted-foreground">,</span>
          {'\n'}
          {'  '}
          <span className="text-emerald-400">&quot;model&quot;</span>
          <span className="text-muted-foreground">: </span>
          <span className="text-amber-300">&quot;gemini-2.0&quot;</span>
          {'\n'}
          <span className="text-muted-foreground">{'}'}</span>
        </pre>
      </div>
    );
  }

  return (
    <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-border bg-background p-5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        AI Search Results
      </p>
      <div className="space-y-3">
        {[
          { title: 'Thread: RAG pipeline optimization', score: 0.94, highlight: 'chunking strategies' },
          { title: 'Message by @alex — vector stores', score: 0.87, highlight: 'embedding models' },
          { title: 'Thread: Evaluation frameworks', score: 0.81, highlight: 'recall metrics' },
        ].map((r) => (
          <div key={r.title} className="border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-medium text-foreground">{r.title}</p>
              <span className="text-[10px] text-brand font-mono">{r.score}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              …discussed <span className="bg-brand/15 text-brand px-1 rounded">{r.highlight}</span> in detail…
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage({ user }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Announcement banner */}
      <div className="bg-brand/8 border-b border-brand/15 text-center py-2 px-4">
        <p className="text-[12px] text-muted-foreground">
          Open source discussion platform with AI built into every thread.{' '}
          <Link href="#features" className="text-brand font-medium hover:underline">
            Explore features →
          </Link>
        </p>
      </div>

      <PublicNavbar user={user} />

      <main>
        {/* Hero */}
        <section className="relative pt-20 pb-8 px-6 overflow-hidden">
          <MosaicTile className="w-16 h-16 -left-4 top-32 hidden lg:block" />
          <MosaicTile className="w-12 h-12 left-8 top-52 hidden lg:block opacity-40" />
          <MosaicTile className="w-20 h-20 -right-2 top-28 hidden lg:block" />
          <MosaicTile className="w-10 h-10 right-12 top-56 hidden lg:block opacity-40" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <FadeIn>
              <h1 className="text-4xl md:text-[3.5rem] leading-[1.08] tracking-tight text-foreground mb-5">
                <SerifHeading>Discussions, built for the AI era</SerifHeading>
              </h1>
            </FadeIn>
            <FadeIn delay={0.08}>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
                The discussion platform where real-time threads, AI synthesis, and smart moderation
                work together — not bolted on.
              </p>
            </FadeIn>
            <FadeIn delay={0.16}>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-all text-sm"
              >
                Start for free
                <ArrowRight size={15} />
              </Link>
            </FadeIn>
          </div>

          <FadeIn className="max-w-5xl mx-auto mt-14 relative z-10" delay={0.24} y={30}>
            <div className="relative rounded-2xl overflow-hidden">
              <DashboardPreview />
            </div>
          </FadeIn>
        </section>

        {/* Capability strip */}
        <section className="py-8 border-y border-border overflow-hidden">
          <div className="flex items-center justify-center gap-8 md:gap-12 px-6 flex-wrap">
            {capabilities.map((label) => (
              <span
                key={label}
                className="text-[13px] font-medium text-muted-foreground whitespace-nowrap tracking-wide uppercase"
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* Feature rows */}
        <section id="features" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <FadeIn className="mb-20 text-center">
              <h2 className="text-3xl md:text-4xl tracking-tight text-foreground mb-4">
                <SerifHeading>Designed to make your community smarter</SerifHeading>
              </h2>
            </FadeIn>

            <div className="space-y-24">
              {featureRows.map((row, i) => (
                <FadeIn key={row.title} delay={i * 0.05}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
                    <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                      <FeatureVisual type={row.visual} />
                    </div>
                    <div className={i % 2 === 1 ? 'md:order-1' : ''}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-brand mb-3 block">
                        {row.tag}
                      </span>
                      <h3 className="text-2xl md:text-3xl tracking-tight text-foreground mb-4">
                        <SerifHeading>{row.title}</SerifHeading>
                      </h3>
                      <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">{row.description}</p>
                      <Link
                        href={row.link}
                        className="text-[13px] font-medium text-foreground inline-flex items-center gap-1 hover:gap-2 transition-all"
                      >
                        Learn more <ChevronRight size={14} />
                      </Link>
                      <div className="mt-8 p-5 rounded-xl bg-muted border border-border">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          {row.quote.source}
                        </p>
                        <p className="text-[13px] text-muted-foreground leading-relaxed italic">
                          &ldquo;{row.quote.text}&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics split section */}
        <section className="grid grid-cols-1 md:grid-cols-2 min-h-[480px]">
          <div className="bg-secondary text-secondary-foreground px-8 md:px-14 py-16 flex flex-col justify-center">
            <FadeIn>
              <h2 className="text-3xl md:text-4xl tracking-tight mb-8 leading-tight">
                <SerifHeading>Highest quality discussions at every scale</SerifHeading>
              </h2>
              <div className="space-y-5">
                {[
                  { icon: Zap, label: 'Latency', desc: 'WebSocket delivery, not polling' },
                  { icon: Sparkles, label: 'Intelligence', desc: 'AI woven into threads, not added on' },
                  { icon: Shield, label: 'Safety', desc: 'Moderation and membership by default' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
                      <Icon size={15} className="text-secondary-foreground/80" />
                    </div>
                    <div>
                      <p className="font-medium text-[14px]">{label}</p>
                      <p className="text-[13px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
          <div className="bg-background px-8 md:px-14 py-16 flex flex-col justify-center border-t md:border-t-0 md:border-l border-border">
            <FadeIn>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-8">
                Platform comparison
              </p>
              <div className="space-y-7">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <p className="text-[13px] font-medium text-foreground/80 mb-2">{m.label}</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-20">Sastram</span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-brand rounded transition-all duration-700"
                            style={{ width: `${m.sastram}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-brand w-8">{m.sastram}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-20">Typical</span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-muted-foreground/30 rounded"
                            style={{ width: `${m.others}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-8">{m.others}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Use cases / trust grid */}
        <section className="py-24 px-6 bg-muted/50">
          <div className="max-w-5xl mx-auto">
            <FadeIn className="mb-14 text-center">
              <h2 className="text-3xl md:text-4xl tracking-tight text-foreground">
                <SerifHeading>Built for teams that need more than a forum</SerifHeading>
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FadeIn className="md:col-span-1 md:row-span-2">
                <div className="h-full min-h-[280px] p-8 rounded-2xl bg-background border border-border flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand mb-4">
                      {useCases[0].source}
                    </p>
                    <p className="text-xl md:text-2xl text-foreground leading-relaxed">
                      <SerifHeading>&ldquo;{useCases[0].quote}&rdquo;</SerifHeading>
                    </p>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-6">— {useCases[0].author}</p>
                </div>
              </FadeIn>
              <FadeIn delay={0.08}>
                <div className="p-8 rounded-2xl bg-background border border-border">
                  <p className="text-4xl font-bold text-foreground mb-1">{useCases[1].label}</p>
                  <p className="text-[13px] text-muted-foreground">{useCases[1].sublabel}</p>
                </div>
              </FadeIn>
              <FadeIn delay={0.12}>
                <div className="relative p-8 rounded-2xl bg-gradient-to-br from-brand to-brand/80 text-white overflow-hidden min-h-[160px] flex flex-col justify-end">
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-4 right-4 w-32 h-32 rounded-full bg-background/20" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-background/10 -translate-x-1/4 translate-y-1/4" />
                  </div>
                  <p className="relative text-lg font-medium leading-snug">{useCases[2].title}</p>
                  <p className="relative text-[13px] text-white/70 mt-2">{useCases[2].subtitle}</p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-24 px-6 border-t border-border">
          <div className="max-w-4xl mx-auto">
            <FadeIn className="mb-14 text-center">
              <h2 className="text-3xl md:text-4xl tracking-tight text-foreground mb-4">
                <SerifHeading>Three steps to an AI-powered community</SerifHeading>
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: '01',
                  icon: Users,
                  title: 'Create a community',
                  desc: 'Organize threads by topic with sections, tags, and invites.',
                },
                {
                  step: '02',
                  icon: MessageSquare,
                  title: 'Start discussing',
                  desc: 'Real-time threads with nested replies, polls, and @mentions.',
                },
                {
                  step: '03',
                  icon: Sparkles,
                  title: 'Let AI help',
                  desc: 'Summaries, search, inline @sai answers, and daily digests.',
                },
              ].map((s, i) => (
                <FadeIn key={s.step} delay={i * 0.08}>
                  <div className="p-6 rounded-2xl border border-border bg-background h-full">
                    <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-[12px] font-bold mb-4">
                      {s.step}
                    </div>
                    <s.icon size={18} className="text-brand mb-3" />
                    <h3 className="font-semibold text-foreground mb-2">{s.title}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* Demo video */}
        <section className="py-16 px-6 bg-muted/50">
          <ThemeVideo className="max-w-4xl mx-auto" />
        </section>

        {/* Security section */}
        <section className="bg-secondary text-secondary-foreground py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <FadeIn className="mb-14 text-center">
              <h2 className="text-3xl md:text-4xl tracking-tight">
                <SerifHeading>Enterprise-grade security and controls</SerifHeading>
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {securityFeatures.map((f, i) => (
                <FadeIn key={f.title} delay={i * 0.08}>
                  <div className="text-center md:text-left">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 mx-auto md:mx-0">
                      <f.icon size={18} className="text-secondary-foreground/80" />
                    </div>
                    <h3 className="font-semibold text-[15px] mb-2">{f.title}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{f.description}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-28 px-6 text-center">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl tracking-tight text-foreground mb-4">
              <SerifHeading>Discussions built for your community</SerifHeading>
            </h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
              Real-time threads, AI synthesis, and smart moderation — free to start, no credit card
              required.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-all text-sm"
            >
              Get started free
              <ArrowRight size={15} />
            </Link>
          </FadeIn>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
