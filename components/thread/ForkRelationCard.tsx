'use client';

import React from 'react';
import Link from 'next/link';
import { GitFork, ExternalLink, MessageSquare, Check, X, ArrowRightLeft } from 'lucide-react';
import { DetailCard } from '@/components/ui/detail-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { decideSupersedeAction, proposeSupersedeAction } from '@/modules/threads/actions';
import { ForkTreeDialog } from './fork-tree-dialog';

type Fork = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  visibility: string;
  messageCount: number;
  forkKind?: 'ASSUMPTION' | 'CONTINUE' | 'REMIX_AI' | 'EXTERNAL' | null;
  supersedeStatus?: 'NONE' | 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | null;
  createdBy?: string | null;
};

type ForkedFrom = { id: string; name: string; slug: string; description: string | null; createdBy?: string | null } | null;

function kindLabel(kind?: string | null) {
  if (!kind) return 'Continue';
  if (kind === 'ASSUMPTION') return 'Assumption';
  if (kind === 'REMIX_AI') return 'Remix AI';
  if (kind === 'EXTERNAL') return 'External';
  return 'Continue';
}

export function ForkRelationCard({ threadId, currentUserId, isParentOp }: { threadId: string; currentUserId?: string; isParentOp?: boolean }) {
  const [loading, setLoading] = React.useState(true);
  const [forks, setForks] = React.useState<Fork[]>([]);
  const [forkedFrom, setForkedFrom] = React.useState<ForkedFrom>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${threadId}/fork`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setForks(json.data?.forks ?? []);
      setForkedFrom(json.data?.forkedFrom ?? null);
    } catch {
      setForks([]);
      setForkedFrom(null);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) {
    return (
      <DetailCard>
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-8 w-full" />
      </DetailCard>
    );
  }

  if (!forkedFrom && forks.length === 0) return null;

  const propose = async (forkThreadId: string) => {
    setBusy(forkThreadId);
    try {
      const r = await proposeSupersedeAction({ forkThreadId });
      if (!r.ok) throw new Error(r.error || 'Failed to propose');
      toasts.success('Supersede proposed');
      await load();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to propose');
    } finally {
      setBusy(null);
    }
  };

  const decide = async (forkThreadId: string, decision: 'ACCEPTED' | 'DECLINED') => {
    setBusy(forkThreadId + decision);
    try {
      const r = await decideSupersedeAction({ forkThreadId, decision });
      if (!r.ok) throw new Error(r.error || 'Failed to decide');
      toasts.success(decision === 'ACCEPTED' ? 'Supersede accepted' : 'Supersede declined');
      await load();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to decide');
    } finally {
      setBusy(null);
    }
  };

  return (
    <DetailCard className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-ink-3">
          <div className="w-6 h-6 rounded-control bg-zinc-800 flex items-center justify-center">
            <GitFork size={12} className="text-white" />
          </div>
          Forks & lineage
        </div>
        <ForkTreeDialog threadId={threadId} />
      </div>

      {forkedFrom && (
        <div className="group rounded-card border border-line bg-canvas p-3 hover:bg-hover transition-colors space-y-2">
          <p className="text-xs font-medium text-ink-3 flex items-center gap-1"><GitFork size={10}/> Forked from</p>
          <Link href={`/dashboard/threads/${forkedFrom.slug}`} className="block">
            <p className="text-sm font-medium text-ink group-hover:text-brand line-clamp-1">{forkedFrom.name}</p>
            {forkedFrom.description && <p className="text-xs text-ink-3 line-clamp-2 mt-1 leading-relaxed">{forkedFrom.description}</p>}
            <span className="inline-flex items-center gap-1 text-xs text-brand mt-1.5">View original <ExternalLink size={10}/></span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/canvas?left=${forkedFrom.id}&right=${threadId}`} className="text-xs text-ink-2 hover:text-brand inline-flex items-center gap-1"><ArrowRightLeft size={11}/> Compare parent vs fork</Link>
          </div>
        </div>
      )}

      {forks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">{forks.length} fork{forks.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {forks.map((f) => {
              const mine = currentUserId && f.createdBy === currentUserId;
              const canPropose = !!mine && (!f.supersedeStatus || f.supersedeStatus === 'NONE' || f.supersedeStatus === 'DECLINED');
              const canDecide = !!isParentOp && f.supersedeStatus === 'PROPOSED';
              return (
                <div key={f.id} className="relative" onMouseEnter={() => setHovered(f.id)} onMouseLeave={() => setHovered(null)}>
                  <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface hover:bg-hover hover:border-line-strong p-3 transition-all shadow-sm">
                    <Link href={`/dashboard/threads/${f.slug}`} className="group">
                      <p className="text-sm font-medium text-ink line-clamp-1 group-hover:text-brand">{f.name}</p>
                      {f.description && <p className="text-xs text-ink-3 line-clamp-2 leading-relaxed">{f.description}</p>}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <span className="inline-flex items-center gap-1"><MessageSquare size={10}/>{f.messageCount}</span>
                      <span className="px-1.5 py-0.5 rounded border border-line bg-canvas text-[10px]">{kindLabel(f.forkKind)}</span>
                      <span className={`px-1 py-0.5 rounded text-[10px] border ${f.visibility === 'PRIVATE' ? 'bg-amber-500/10 border-amber-500/20 text-amber-700' : f.visibility === 'RESTRICTED' ? 'bg-sky-500/10 border-sky-500/20 text-sky-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'}`}>{f.visibility}</span>
                      {f.supersedeStatus && f.supersedeStatus !== 'NONE' && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${f.supersedeStatus === 'ACCEPTED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : f.supersedeStatus === 'PROPOSED' ? 'bg-amber-500/10 border-amber-500/20 text-amber-700' : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-700'}`}>
                          Supersede {f.supersedeStatus.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href={`/dashboard/canvas?left=${threadId}&right=${f.id}`} className="text-xs text-ink-2 hover:text-brand inline-flex items-center gap-1"><ArrowRightLeft size={11}/> Compare</Link>
                      {canPropose && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy === f.id} onClick={() => propose(f.id)}>Propose supersede</Button>
                      )}
                      {canDecide && (
                        <>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy === f.id + 'ACCEPTED'} onClick={() => decide(f.id, 'ACCEPTED')}><Check size={11} className="mr-1"/>Accept</Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy === f.id + 'DECLINED'} onClick={() => decide(f.id, 'DECLINED')}><X size={11} className="mr-1"/>Decline</Button>
                        </>
                      )}
                    </div>
                  </div>
                  {hovered === f.id && f.description && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-card border border-line bg-surface shadow-lg p-3 animate-in fade-in slide-in-from-top-1 duration-150 pointer-events-none">
                      <p className="text-xs font-medium text-ink-3 mb-1">Preview</p>
                      <p className="text-sm font-medium text-ink">{f.name}</p>
                      <p className="text-xs text-ink-2 mt-1 line-clamp-3 leading-relaxed">{f.description}</p>
                      <p className="text-xs text-ink-3 mt-2">{f.messageCount} messages · {new Date(f.createdAt).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-3">No forks yet.</p>
      )}
    </DetailCard>
  );
}
