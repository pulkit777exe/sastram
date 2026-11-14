import Link from 'next/link';
import {
  MessageSquare,
  Users,
  Sparkles,
  Search,
  Shield,
  ArrowRight,
  ChevronRight,
  Check,
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
  'Ask with AI search',
  'Cited AI synthesis',
  'Community claim verification',
  'Threaded discussions',
  'Sai @-mentions',
  'Moderation',
  'Bookmarks & follows',
];

const featureRows = [
  {
    title: 'Ask and get a cited starting answer',
    description:
      'Ask in plain language and get an AI-synthesized response grounded in thread and message sources. It is a starting point for discussion, not a final authority.',
    link: '#features',
    tag: 'Ask',
    visual: 'search' as const,
    quote: {
      source: 'AI-assisted, source-aware',
      text: 'Citations help readers inspect where an answer comes from before treating it as settled.',
    },
  },
  {
    title: 'Verify claims together in discussion',
    description:
      'Bring the question into threads where people can examine sources, add context, and work through claim-level verification as a community. AI output is labeled as AI-estimated where relevant.',
    link: '#features',
    tag: 'Verify',
    visual: 'threads' as const,
    quote: {
      source: 'Community verification',
      text: 'Discussion, replies, and moderation tools help keep evidence and context attached to each claim.',
    },
  },
  {
    title: 'Turn verified discussion into durable answers',
    description:
      'Keep questions, replies, and follow-ups organized so improved answers remain easy to find later. Mentions, summaries, and digests support the same ask → synthesis → verification loop.',
    link: '#features',
    tag: 'Resolve',
    visual: 'ai' as const,
    quote: {
      source: 'Built for follow-through',
      text: 'Threads, subscriptions, and AI-assisted tools help conversations stay useful over time.',
    },
  },
];

const platformDetails = [
  'AI-synthesized search answers with citations to inspect',
  'Threaded discussions for community claim verification',
  'Nested replies, reactions, mentions, polls, and bookmarks',
  'Moderation, reports, appeals, and visibility controls',
  'Email invitations, digests, and password reset flows',
  'Open source under the MIT License',
];

const securityFeatures = [
  {
    icon: Shield,
    title: 'Built-in moderation',
    description: 'Regex rules, Sai content filtering, reports, appeals, and ban management out of the box.',
  },
  {
    icon: Lock,
    title: 'Visibility-scoped access',
    description: 'Public, restricted, and private threads, with per-thread bans and moderator controls.',
  },
  {
    icon: UserCheck,
    title: 'Better Auth',
    description: 'Email OTP, OAuth, and session management with rate limits on sensitive routes.',
  },
];

const useCases = [
  {
    type: 'quote' as const,
    source: 'Use case · Research teams',
    quote: 'Start with a question, then improve the answer together.',
    author:
      'Use AI-synthesized, cited responses as a starting point, then rely on community verification in discussion to make answers more durable.',
  },
  {
    type: 'stat' as const,
    label: 'MIT licensed',
    sublabel: 'Open source. Self-host it or run it on Vercel.',
  },
  {
    type: 'image' as const,
    title: 'Built for questions that need evidence',
    subtitle: 'Ask · Synthesize · Verify · Open source',
  },
];

function MosaicTile({ className }: { className?: string }) {
  return (
    <div
      className={`absolute rounded-sm opacity-60 blur-none ${className}`}
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
    { name: 'Scaling a research workflow', replies: 18, tag: 'Infra' },
    { name: 'Thread resolution scoring', replies: 31, tag: 'Product' },
    { name: 'Community moderation patterns', replies: 12, tag: 'Mod' },
  ];

  return (
    <div className="w-full bg-background rounded-card border border-line shadow-linear-xl overflow-hidden text-left">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-muted/80">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex-1 mx-4">
          <div className="h-7 bg-background border border-line rounded-control flex items-center px-3 gap-2">
            <Search size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Search threads, messages, users…</span>
          </div>
        </div>
      </div>
      <div className="flex min-h-70">
        <div className="w-44 border-r border-line bg-muted/50 p-3 hidden sm:block">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Topics
          </p>
          {['Engineering', 'Research', 'General'].map((c, i) => (
            <div
              key={c}
              className={`text-xs px-2 py-1.5 rounded-control mb-0.5 ${i === 0 ? 'bg-brand/10 text-brand font-medium' : 'text-muted-foreground'}`}
            >
              {c}
            </div>
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-foreground">Recent threads</p>
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
          <div className="space-y-1.5">
            {threads.map((t) => (
              <div
                key={t.name}
                className={`flex items-center justify-between px-3 py-2.5 rounded-control border text-xs ${t.active ? 'border-brand/20 bg-brand/5' : 'border-line bg-background'}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{t.name}</p>
                  <p className="text-muted-foreground mt-0.5">{t.replies} replies</p>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-2 flex-none">
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
      <div className="relative w-full aspect-[4/3] rounded-card overflow-hidden bg-gradient-to-br from-brand/20 via-brand/5 to-emerald-500/10 p-6">
        <div className="absolute inset-0 opacity-30">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-8 h-8 rounded-control bg-brand/20"
              style={{
                left: `${(i % 4) * 25 + 5}%`,
                top: `${Math.floor(i / 4) * 30 + 10}%`,
                transform: `rotate(${i * 15}deg)`,
              }}
            />
          ))}
        </div>
        <div className="relative bg-background/90 backdrop-blur rounded-card border border-white/60 p-4 shadow-linear-lg">
          <div className="space-y-2">
            {['How do we handle concurrent edits?', 'How should we source citations?'].map((msg, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-brand/20 flex-none" />
                <div className="bg-muted rounded-control px-3 py-2 text-xs text-foreground/80 flex-1">
                  {msg}
                </div>
              </div>
            ))}
            <div className="flex gap-2 items-start justify-end">
              <div className="bg-brand text-white rounded-control px-3 py-2 text-xs">
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
      <div className="w-full aspect-[4/3] rounded-card overflow-hidden bg-zinc-950 p-5 font-mono text-xs leading-relaxed">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/80" />
            <div className="w-2 h-2 rounded-full bg-amber-500/80" />
            <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-muted-foreground text-xs">@sai mention handler</span>
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
          <span className="text-amber-300">&quot;provider&quot;</span>
          <span className="text-muted-foreground">: </span>
          <span className="text-amber-300">&quot;gemini&quot;</span>
          {'\n'}
          <span className="text-muted-foreground">{'}'}</span>
        </pre>
      </div>
    );
  }

  return (
    <div className="w-full aspect-[4/3] rounded-card overflow-hidden border border-line bg-background p-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Sai Search Results
      </p>
      <div className="space-y-3">
        {[
          { title: 'Thread: RAG pipeline optimization', score: 0.94, highlight: 'chunking strategies' },
          { title: 'Message by @alex — vector stores', score: 0.87, highlight: 'embedding models' },
          { title: 'Thread: Evaluation frameworks', score: 0.81, highlight: 'recall metrics' },
        ].map((r) => (
          <div key={r.title} className="border border-line rounded-control p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">{r.title}</p>
              <span className="text-xs text-brand font-mono">{r.score}</span>
            </div>
            <p className="text-xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground">
          Open source discussion and research platform. MIT licensed.{' '}
          <Link href="#features" className="text-brand font-medium hover:underline">
            See what&apos;s included →
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
                <SerifHeading>Ask a question. Verify the answer together.</SerifHeading>
              </h1>
            </FadeIn>
            <FadeIn delay={0.08}>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
                Get an AI-synthesized answer with sources, then use community claim verification in
                discussion to improve it into a durable answer. AI output is AI-estimated and meant
                to be checked.
              </p>
            </FadeIn>
            <FadeIn delay={0.16}>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/login?redirect=%2Fdashboard%2Fsai-search"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-control hover:bg-primary/90 transition-all text-sm"
                >
                  Ask a question
                  <ArrowRight size={15} />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-line text-foreground font-medium rounded-control hover:bg-muted/50 transition-all text-sm"
                >
                  See how it works
                </Link>
              </div>
            </FadeIn>
          </div>

          <FadeIn className="max-w-5xl mx-auto mt-14 relative z-10" delay={0.24} y={30}>
            <div className="relative rounded-card overflow-hidden">
              <DashboardPreview />
            </div>
          </FadeIn>
        </section>

        {/* Capability strip */}
        <section className="py-8 border-y border-line overflow-hidden">
          <div className="flex items-center justify-center gap-8 md:gap-12 px-6 flex-wrap">
            {capabilities.map((label) => (
              <span
                key={label}
                className="text-sm font-medium text-muted-foreground whitespace-nowrap tracking-wide uppercase"
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
                <SerifHeading>From a question to a verified, durable answer</SerifHeading>
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
                      <span className="text-xs font-semibold uppercase tracking-wider text-brand mb-3 block">
                        {row.tag}
                      </span>
                      <h3 className="text-2xl md:text-3xl tracking-tight text-foreground mb-4">
                        <SerifHeading>{row.title}</SerifHeading>
                      </h3>
                      <p className="text-base text-muted-foreground leading-relaxed mb-5">{row.description}</p>
                      <Link
                        href={row.link}
                        className="text-sm font-medium text-foreground inline-flex items-center gap-1 hover:gap-2 transition-all"
                      >
                        Learn more <ChevronRight size={14} />
                      </Link>
                      <div className="mt-8 p-5 rounded-card bg-muted border border-line">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          {row.quote.source}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed italic">
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
        <section className="grid grid-cols-1 md:grid-cols-2 min-h-120">
          <div className="bg-secondary text-secondary-foreground px-8 md:px-14 py-16 flex flex-col justify-center">
            <FadeIn>
              <h2 className="text-3xl md:text-4xl tracking-tight mb-8 leading-tight">
                <SerifHeading>Built for answers that can be checked</SerifHeading>
              </h2>
              <div className="space-y-5">
                {[
                  {
                    icon: Search,
                    label: 'Cited AI synthesis',
                    desc: 'Ask a question and start from an AI-synthesized answer with sources to inspect.',
                  },
                  {
                    icon: MessageSquare,
                    label: 'Community verification',
                    desc: 'Use threaded discussion to examine claims, add context, and improve the response.',
                  },
                  {
                    icon: Shield,
                    label: 'Moderation and controls',
                    desc: 'Visibility settings, rules, reports, appeals, and AI guardrails help keep discussions useful.',
                  },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-control bg-primary/10 flex items-center justify-center flex-none">
                      <Icon size={15} className="text-secondary-foreground/80" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
          <div className="bg-background px-8 md:px-14 py-16 flex flex-col justify-center border-t md:border-t-0 md:border-l border-line">
            <FadeIn>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-8">
                Platform
              </p>
              <ul className="space-y-4">
                {platformDetails.map((detail) => (
                  <li key={detail} className="flex items-start gap-3 text-sm text-foreground">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand/10 text-brand">
                      <Check size={13} />
                    </span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </FadeIn>
          </div>
        </section>

        {/* Use cases / trust grid */}
        <section className="py-24 px-6 bg-muted/50">
          <div className="max-w-5xl mx-auto">
            <FadeIn className="mb-14 text-center">
              <h2 className="text-3xl md:text-4xl tracking-tight text-foreground">
                <SerifHeading>Built for teams that need evidence, not just replies</SerifHeading>
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FadeIn className="md:col-span-1 md:row-span-2">
                <div className="h-full min-h-70 p-8 rounded-card bg-background border border-line flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-brand mb-4">
                      {useCases[0].source}
                    </p>
                    <p className="text-xl md:text-2xl text-foreground leading-relaxed">
                      <SerifHeading>{useCases[0].quote}</SerifHeading>
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-6">{useCases[0].author}</p>
                </div>
              </FadeIn>
              <FadeIn delay={0.08}>
                <div className="p-8 rounded-card bg-background border border-line">
                  <p className="text-4xl font-bold text-foreground mb-1">{useCases[1].label}</p>
                  <p className="text-sm text-muted-foreground">{useCases[1].sublabel}</p>
                </div>
              </FadeIn>
              <FadeIn delay={0.12}>
                <div className="relative p-8 rounded-card bg-gradient-to-br from-brand to-brand/80 text-white overflow-hidden min-h-40 flex flex-col justify-end">
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-4 right-4 w-32 h-32 rounded-full bg-background/20" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-background/10 -translate-x-1/4 translate-y-1/4" />
                  </div>
                  <p className="relative text-lg font-medium leading-snug">{useCases[2].title}</p>
                  <p className="relative text-sm text-white/70 mt-2">{useCases[2].subtitle}</p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-24 px-6 border-t border-line">
          <div className="max-w-4xl mx-auto">
            <FadeIn className="mb-14 text-center">
              <h2 className="text-3xl md:text-4xl tracking-tight text-foreground mb-4">
                <SerifHeading>From question to a better answer in three steps</SerifHeading>
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: '01',
                  icon: Search,
                  title: 'Ask a question',
                  desc: 'Search or ask in plain language to get an AI-synthesized answer with sources.',
                },
                {
                  step: '02',
                  icon: Users,
                  title: 'Verify claims together',
                  desc: 'Discuss the response, inspect citations, and work through claim-level verification as a community.',
                },
                {
                  step: '03',
                  icon: Sparkles,
                  title: 'Improve the answer',
                  desc: 'Keep context in threads so AI-estimated answers can become clearer, more durable responses over time.',
                },
              ].map((s, i) => (
                <FadeIn key={s.step} delay={i * 0.08}>
                  <div className="p-6 rounded-card border border-line bg-background h-full">
                    <div className="w-9 h-9 rounded-control bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mb-4">
                      {s.step}
                    </div>
                    <s.icon size={18} className="text-brand mb-3" />
                    <h3 className="font-semibold text-foreground mb-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
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
                <SerifHeading>Security and controls</SerifHeading>
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {securityFeatures.map((f, i) => (
                <FadeIn key={f.title} delay={i * 0.08}>
                  <div className="text-center md:text-left">
                    <div className="w-10 h-10 rounded-card bg-primary/10 flex items-center justify-center mb-4 mx-auto md:mx-0">
                      <f.icon size={18} className="text-secondary-foreground/80" />
                    </div>
                    <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
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
              <SerifHeading>Ask first. Verify together. Keep the answer.</SerifHeading>
            </h2>
            <p className="text-base text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
              Start with an AI-synthesized, cited response, then use community claim verification in
              discussion to build a more durable answer. Open source and free to use.
            </p>
            <Link
              href="/login?redirect=%2Fdashboard%2Fsai-search"
              className="inline-flex items-center gap-2 px-7 py-3 bg-primary text-primary-foreground font-medium rounded-control hover:bg-primary/90 transition-all text-sm"
            >
              Ask a question
              <ArrowRight size={15} />
            </Link>
          </FadeIn>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
