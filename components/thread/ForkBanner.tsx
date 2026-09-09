'use client';

import React from 'react';
import Link from 'next/link';
import { GitFork, ArrowRight } from 'lucide-react';

export function ForkBanner({ threadId }: { threadId: string }) {
  const [forkedFrom, setForkedFrom] = React.useState<{ id: string; name: string; slug: string; description: string | null } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/fork`);
        if (!res.ok) throw new Error('no');
        const json = await res.json();
        if (!cancelled) setForkedFrom(json.data?.forkedFrom ?? null);
      } catch {
        if (!cancelled) setForkedFrom(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (loading || !forkedFrom) return null;
  return (
    <div className="mx-auto max-w-4xl w-full px-6 pt-3">
      <div className="group rounded-card border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200 border-b border-amber-200/60 bg-amber-50 dark:bg-amber-950/30">
          <GitFork size={14} className="shrink-0" />
          <span>Forked from</span>
          <span className="ml-auto hidden sm:inline text-amber-700/60">Subtle preview — like Reddit</span>
        </div>
        <Link href={`/dashboard/threads/${forkedFrom.slug}`} className="block p-3 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
          <p className="text-sm font-semibold text-ink group-hover:text-amber-900 dark:group-hover:text-amber-100 line-clamp-1">{forkedFrom.name}</p>
          {forkedFrom.description && <p className="text-xs text-ink-3 line-clamp-2 mt-1 leading-relaxed">{forkedFrom.description}</p>}
          <span className="inline-flex items-center gap-1 text-xs text-brand mt-2">View original <ArrowRight size={12}/></span>
        </Link>
      </div>
    </div>
  );
}
