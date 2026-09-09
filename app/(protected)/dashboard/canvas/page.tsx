import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { crossReference } from '@/modules/ai-search/synthesis';
import { logger } from '@/lib/infrastructure/logger';
import Link from 'next/link';

export default async function CanvasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await requireSession();
  if (!session) return null;
  const params = await searchParams;
  const leftId = params.left;
  const rightId = params.right;

  const [left, right] = await Promise.all([
    leftId ? prisma.thread.findUnique({ where: { id: leftId }, select: { id: true, name: true, slug: true, aiSummary: true, threadDna: true, resolutionScore: true } }).catch(() => null) : null,
    rightId ? prisma.thread.findUnique({ where: { id: rightId }, select: { id: true, name: true, slug: true, aiSummary: true, threadDna: true, resolutionScore: true } }).catch(() => null) : null,
  ]);

  let diff: { conflictDetected: boolean; description: string; sideA: string; sideB: string; ranked: { title: string; tier: number; domain: string }[] } | null = null;

  if (left && right && left.aiSummary && right.aiSummary) {
    try {
      const geminiKey = process.env.SASTRAM_GEMINI_KEY ?? process.env.GEMINI_API_KEY ?? '';
      const openaiKey = process.env.OPENAI_API_KEY;
      if (geminiKey) {
        const leftSrc = {
          id: left.id,
          title: left.name,
          url: `/dashboard/threads/${left.slug}`,
          domain: 'sastram.local',
          snippet: left.aiSummary.slice(0, 300),
          text: left.aiSummary,
          publishedDate: undefined,
          tier: 2 as const,
          confidence: 75,
          isOutdated: false,
          provider: 'exa' as const,
          contentFetched: true,
        };
        const rightSrc = {
          id: right.id,
          title: right.name,
          url: `/dashboard/threads/${right.slug}`,
          domain: 'sastram.local',
          snippet: right.aiSummary.slice(0, 300),
          text: right.aiSummary,
          publishedDate: undefined,
          tier: 2 as const,
          confidence: 75,
          isOutdated: false,
          provider: 'tavily' as const,
          contentFetched: true,
        };
        const cross = await crossReference({ exaSources: [leftSrc], tavilySources: [rightSrc] }, `Compare "${left.name}" vs "${right.name}"`, geminiKey, openaiKey);
        diff = {
          conflictDetected: cross.conflictData.detected,
          description: cross.conflictData.description,
          sideA: cross.conflictData.sideA,
          sideB: cross.conflictData.sideB,
          ranked: cross.rankedSources.map((s) => ({ title: s.title, tier: s.tier, domain: s.domain })),
        };
      } else {
        diff = {
          conflictDetected: false,
          description: 'AI key not configured — showing tier-sorted sources only.',
          sideA: left.name,
          sideB: right.name,
          ranked: [left, right].map((t) => ({ title: t.name, tier: 2, domain: 'sastram.local' })),
        };
      }
    } catch (err) {
      logger.warn('[canvas] crossReference diff failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  const dnaOverlap = (() => {
    if (!left?.threadDna || !right?.threadDna) return null;
    try {
      const a = (left.threadDna as unknown as { topics?: string[] })?.topics ?? [];
      const b = (right.threadDna as unknown as { topics?: string[] })?.topics ?? [];
      const shared = a.filter((t) => b.includes(t));
      return { a, b, shared };
    } catch {
      return null;
    }
  })();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="font-serif-heading text-xl">Research Canvas</h1>
      <p className="text-xs text-ink-3 mt-1">Compare two threads side-by-side. AI diff via <code>crossReference</code> tier sort + conflict detection.</p>
      <p className="text-xs text-ink-3 mt-1">
        Pick threads via <code>?left=&lt;id&gt;&amp;right=&lt;id&gt;</code> or <Link href="/dashboard/threads" className="underline hover:text-ink">browse threads</Link>.
      </p>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{left?.name ?? 'Select left thread via ?left=<id>'}</h2>
            {left?.resolutionScore != null && <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-muted">{left.resolutionScore}%</span>}
          </div>
          <p className="text-xs text-ink-2 whitespace-pre-wrap mt-2 leading-relaxed">{left?.aiSummary ?? 'No summary — open the thread to generate one.'}</p>
          {left && <Link href={`/dashboard/threads/${left.slug}`} className="text-xs underline text-ink-3 hover:text-ink mt-2 inline-block">Open thread →</Link>}
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{right?.name ?? 'Select right thread via ?right=<id>'}</h2>
            {right?.resolutionScore != null && <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-muted">{right.resolutionScore}%</span>}
          </div>
          <p className="text-xs text-ink-2 whitespace-pre-wrap mt-2 leading-relaxed">{right?.aiSummary ?? 'No summary — open the thread to generate one.'}</p>
          {right && <Link href={`/dashboard/threads/${right.slug}`} className="text-xs underline text-ink-3 hover:text-ink mt-2 inline-block">Open thread →</Link>}
        </div>
      </div>

      {dnaOverlap && (
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink">Topic overlap</p>
          <p className="text-xs text-ink-3 mt-1">
            Shared: {dnaOverlap.shared.length ? dnaOverlap.shared.join(', ') : 'none'} · Left: {dnaOverlap.a.join(', ') || '—'} · Right: {dnaOverlap.b.join(', ') || '—'}
          </p>
        </div>
      )}

      {diff ? (
        <div className="mt-4 rounded-card border border-line bg-inset p-4">
          <p className="text-xs font-medium text-ink">AI diff — crossReference</p>
          <p className="text-xs text-ink-2 mt-1">{diff.conflictDetected ? `Conflict detected: ${diff.description}` : 'No direct contradiction detected.'}</p>
          {diff.conflictDetected && (
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <div className="rounded-control border border-line bg-surface p-3">
                <p className="text-xs font-medium text-ink">Side A — {left?.name}</p>
                <p className="text-xs text-ink-2 mt-1 whitespace-pre-wrap">{diff.sideA || left?.aiSummary?.slice(0, 400)}</p>
              </div>
              <div className="rounded-control border border-line bg-surface p-3">
                <p className="text-xs font-medium text-ink">Side B — {right?.name}</p>
                <p className="text-xs text-ink-2 mt-1 whitespace-pre-wrap">{diff.sideB || right?.aiSummary?.slice(0, 400)}</p>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {diff.ranked.map((s) => (
              <span key={s.title} className="inline-flex items-center rounded-chip border border-line bg-surface px-2 py-0.5 text-xs">
                Tier {s.tier} · {s.domain} · {s.title.slice(0, 32)}
              </span>
            ))}
          </div>
        </div>
      ) : left && right && left.aiSummary && right.aiSummary ? (
        <div className="mt-4 rounded-card border border-line bg-inset p-4">
          <p className="text-xs font-medium text-ink-3">AI diff unavailable — check GEMINI key or try again.</p>
        </div>
      ) : null}
    </div>
  );
}
