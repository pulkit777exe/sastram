import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import Link from 'next/link';
import { Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ForceGraphCanvas } from '@/components/graph/ForceGraphCanvas';

export default async function GraphPage() {
  const session = await requireSession();
  let graphEnabled = true;
  if (session) {
    try {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
      const prefs = parseUserPreferences((user?.preferences as unknown) ?? {});
      graphEnabled = (prefs as unknown as { graphEnabled?: boolean }).graphEnabled !== false;
    } catch {
      graphEnabled = true;
    }
  }
  if (!graphEnabled) {
    return (
      <div className="p-8">
        <h1 className="font-serif-heading text-xl">Relation Graph</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface mt-6">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Network size={22} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-ink">Graph disabled</p>
          <p className="text-sm text-ink-3 mt-1 max-w-sm">Enable it in Settings → Preferences → Graph Explorer.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/settings">Open settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  const relations = await prisma.threadRelation.findMany({
    take: 100,
    orderBy: { similarity: 'desc' },
    include: {
      source: { select: { id: true, name: true, slug: true } },
      target: { select: { id: true, name: true, slug: true } },
    },
  }).catch(() => []);

  const nodeMap = new Map<string, { id: string; name: string; slug: string }>();
  for (const r of relations) {
    nodeMap.set(r.source.id, r.source);
    nodeMap.set(r.target.id, r.target);
  }
  const nodes = Array.from(nodeMap.values());
  const links = relations.map((r) => ({
    id: r.id,
    source: r.source.id,
    target: r.target.id,
    similarity: r.similarity,
  }));

  if (nodes.length === 0) {
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
          <p className="text-xs text-ink-3 mt-1">{nodes.length} threads · {links.length} edges · similarity ≥ 70%</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sai-green" /> 85%+ high</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sai-orange" /> 70-85%</span>
        </div>
      </div>
      <ForceGraphCanvas nodes={nodes} links={links} />
      <p className="text-xs text-ink-3 mt-6 text-center">Showing top {links.length} relations · updated nightly · <Link href="/dashboard/threads" className="underline hover:text-ink">Browse threads</Link></p>
    </div>
  );
}
