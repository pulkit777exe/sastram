import { prisma } from '@/lib/infrastructure/prisma';
import { getSession } from '@/modules/auth';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import Link from 'next/link';

export default async function GraphPage() {
  const session = await getSession();
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
    const prefs = parseUserPreferences(user?.preferences);
    if ((prefs as unknown as { graphEnabled?: boolean }).graphEnabled === false) {
      return (
        <div className="p-8">
          <h1 className="font-serif-heading text-xl">Graph</h1>
          <p className="text-sm text-ink-2 mt-2">Graph explorer is disabled in settings. Enable it in Settings → Preferences → Research.</p>
        </div>
      );
    }
  }
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
        <p className="text-sm text-ink-2 mt-2">No relations yet. Relations are built nightly from thread DNA.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-serif-heading text-xl">Relation Graph</h1>
      <p className="text-xs text-ink-3 mb-4">{nodes.size} threads · {relations.length} edges (similarity ≥ 0.7)</p>
      <div className="grid gap-2">
        {Array.from(relations).map((r) => (
          <Link
            key={r.id}
            href={`/dashboard/threads/${r.target.slug}`}
            className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 text-sm hover:bg-hover"
          >
            <span className="truncate font-medium">{r.source.name}</span>
            <span className="text-ink-3">—{Math.round(r.similarity * 100)}%→</span>
            <span className="truncate text-ink-2">{r.target.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
