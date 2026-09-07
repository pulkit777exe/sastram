import { prisma } from '@/lib/infrastructure/prisma';
import Link from 'next/link';
import { Network, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function GraphPage() {
  const relations = await prisma.threadRelation.findMany({
    take: 100,
    orderBy: { similarity: 'desc' },
    include: {
      source: { select: { id: true, name: true, slug: true } },
      target: { select: { id: true, name: true, slug: true } },
    },
  });

  const nodes = new Map<string, { id: string; name: string; slug: string }>();
  for (const r of relations) {
    nodes.set(r.source.id, r.source);
    nodes.set(r.target.id, r.target);
  }

  if (nodes.size === 0) {
    return (
      <div className="p-8">
        <h1 className="font-serif-heading text-xl">Graph</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface mt-6">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Network size={22} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-ink">No relations yet</p>
          <p className="text-sm text-ink-3 mt-1 max-w-sm">Relations are built nightly from thread DNA. Create more threads to see the graph grow.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/threads">Browse threads</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif-heading text-xl">Relation Graph</h1>
          <p className="text-sm text-ink-2 mt-1">Semantic links between threads — auto-built from thread DNA (topics + question type).</p>
          <p className="text-xs text-ink-3 mt-1">{nodes.size} threads · {relations.length} edges · similarity ≥ 70%</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sai-green" /> 85%+ high</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sai-orange" /> 70-85%</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from(relations).map((r) => {
          const pct = Math.round(r.similarity * 100);
          const isHigh = pct >= 85;
          return (
            <Link
              key={r.id}
              href={`/dashboard/threads/${r.target.slug}`}
              className="group flex flex-col gap-2 rounded-card border border-line bg-surface p-4 hover:bg-hover hover:border-line-strong transition-colors shadow-card"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-medium ${isHigh ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-700'}`}>
                  {pct}%
                </span>
                <span className="h-1 flex-1 rounded-full bg-field overflow-hidden">
                  <span className={`block h-full ${isHigh ? 'bg-sai-green' : 'bg-sai-orange'}`} style={{ width: `${pct}%` }} />
                </span>
                <ArrowRight size={12} className="text-ink-3 group-hover:text-ink" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{r.source.name}</p>
                <p className="text-xs text-ink-3">related to</p>
                <p className="text-sm font-medium text-ink-2 leading-snug line-clamp-2 group-hover:text-ink">{r.target.name}</p>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-ink-3 mt-6 text-center">Showing top {relations.length} relations · updated nightly · <Link href="/dashboard/threads" className="underline hover:text-ink">Browse threads</Link></p>
    </div>
  );
}
