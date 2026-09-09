'use client';

import React from 'react';
import Link from 'next/link';
import { GitFork, ExternalLink, MessageSquare } from 'lucide-react';
import { DetailCard } from '@/components/ui/detail-card';
import { Skeleton } from '@/components/ui/skeleton';

type Fork = { id: string; name: string; slug: string; description: string | null; createdAt: string; visibility: string; messageCount: number };

export function ForkRelationCard({ threadId }: { threadId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [forks, setForks] = React.useState<Fork[]>([]);
  const [forkedFrom, setForkedFrom] = React.useState<{ id: string; name: string; slug: string; description: string | null } | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/fork`);
        if (!res.ok) throw new Error('failed');
        const json = await res.json();
        if (cancelled) return;
        setForks(json.data?.forks ?? []);
        setForkedFrom(json.data?.forkedFrom ?? null);
      } catch {
        if (!cancelled) {
          setForks([]);
          setForkedFrom(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (loading) {
    return (
      <DetailCard>
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-8 w-full" />
      </DetailCard>
    );
  }

  if (!forkedFrom && forks.length === 0) return null;

  return (
    <DetailCard className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-ink-3">
        <div className="w-6 h-6 rounded-control bg-zinc-800 flex items-center justify-center">
          <GitFork size={12} className="text-white" />
        </div>
        Forks
      </div>

      {forkedFrom && (
        <div className="group rounded-card border border-line bg-canvas p-3 hover:bg-hover transition-colors">
          <p className="text-xs font-medium text-ink-3 flex items-center gap-1"><GitFork size={10}/> Forked from</p>
          <Link href={`/dashboard/threads/${forkedFrom.slug}`} className="block mt-1.5">
            <p className="text-sm font-medium text-ink group-hover:text-brand line-clamp-1">{forkedFrom.name}</p>
            {forkedFrom.description && <p className="text-xs text-ink-3 line-clamp-2 mt-1 leading-relaxed">{forkedFrom.description}</p>}
            <span className="inline-flex items-center gap-1 text-xs text-brand mt-1.5">View original <ExternalLink size={10}/></span>
          </Link>
        </div>
      )}

      {forks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">{forks.length} fork{forks.length !== 1 ? 's' : ''} — like Reddit crossposts</p>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {forks.map((f) => (
              <div key={f.id} className="relative" onMouseEnter={() => setHovered(f.id)} onMouseLeave={() => setHovered(null)}>
                <Link href={`/dashboard/threads/${f.slug}`} className="flex flex-col gap-1.5 rounded-card border border-line bg-surface hover:bg-hover hover:border-line-strong p-3 transition-all group shadow-sm hover:shadow-card">
                  <p className="text-sm font-medium text-ink line-clamp-1 group-hover:text-brand">{f.name}</p>
                  {f.description && <p className="text-xs text-ink-3 line-clamp-2 leading-relaxed">{f.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-ink-3">
                    <span className="inline-flex items-center gap-1"><MessageSquare size={10}/>{f.messageCount}</span>
                    <span className={`px-1 py-0.5 rounded text-[10px] border ${f.visibility === 'PRIVATE' ? 'bg-amber-500/10 border-amber-500/20 text-amber-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'}`}>{f.visibility}</span>
                    <span className="ml-auto text-brand opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
                  </div>
                </Link>
                {hovered === f.id && f.description && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-card border border-line bg-surface shadow-lg p-3 animate-in fade-in slide-in-from-top-1 duration-150 pointer-events-none">
                    <p className="text-xs font-medium text-ink-3 mb-1">Preview</p>
                    <p className="text-sm font-medium text-ink">{f.name}</p>
                    <p className="text-xs text-ink-2 mt-1 line-clamp-3 leading-relaxed">{f.description}</p>
                    <p className="text-xs text-ink-3 mt-2">{f.messageCount} messages · {new Date(f.createdAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-3">No forks yet — be the first to fork this thread to your own workspace.</p>
      )}
    </DetailCard>
  );
}
