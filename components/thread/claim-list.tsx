'use client';

import { useEffect, useMemo, useState } from 'react';
import { ThumbsDown, ThumbsUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { toasts } from '@/lib/utils/toast';
import { isSafePublicUrl } from '@/lib/services/content-safety';
import { voteClaimAction } from '@/modules/threads/actions';

type UiClaim = {
  id: string;
  messageId?: string;
  position?: number;
  text: string;
  status: string;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  excerpt?: string | null;
  confidence?: number | null;
  confirmCount: number;
  disputeCount: number;
  net?: number;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-muted text-ink-2 border-line' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
  DISPUTED: { label: 'Disputed', className: 'bg-red-500/10 text-red-700 border-red-500/20' },
  CONTESTED: { label: 'Contested', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
};

function ClaimRow({
  claim,
  onVote,
  busy,
}: {
  claim: UiClaim;
  onVote: (claimId: string, type: 'CONFIRM' | 'DISPUTE') => void;
  busy: boolean;
}) {
  const meta = STATUS_META[claim.status] ?? STATUS_META.OPEN;
  const href = claim.sourceUrl && isSafePublicUrl(claim.sourceUrl) ? claim.sourceUrl : null;
  return (
    <li className="rounded-control border border-line bg-surface/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm leading-relaxed text-ink/90 flex-1 min-w-0">{claim.text}</p>
        <Badge variant="outline" className={cn('shrink-0 text-[11px]', meta.className)}>
          {meta.label}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span>Confirm {claim.confirmCount}</span>
        <span>Dispute {claim.disputeCount}</span>
        {claim.confidence != null ? <span>Confidence {claim.confidence}%</span> : null}
        {claim.sourceLabel ? <span>{claim.sourceLabel}</span> : null}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sai-accent hover:underline">
            Source <ExternalLink size={11} />
          </a>
        ) : null}
      </div>
      {claim.excerpt ? <p className="mt-1.5 text-xs text-ink-2 line-clamp-2">{claim.excerpt}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => onVote(claim.id, 'CONFIRM')}
          disabled={busy}
          aria-label={`Confirm claim: ${claim.text.slice(0, 60)}`}
        >
          <ThumbsUp size={12} /> Confirm
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => onVote(claim.id, 'DISPUTE')}
          disabled={busy}
          aria-label={`Dispute claim: ${claim.text.slice(0, 60)}`}
        >
          <ThumbsDown size={12} /> Dispute
        </Button>
      </div>
    </li>
  );
}

export function ClaimList({ claims }: { claims: UiClaim[] }) {
  const sorted = useMemo(() => [...claims].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [claims]);
  const [items, setItems] = useState<UiClaim[]>(sorted);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Sync when server data changes (e.g. revalidation/navigation).
  useEffect(() => setItems(sorted), [sorted]);

  async function onVote(claimId: string, type: 'CONFIRM' | 'DISPUTE') {
    setBusyId(claimId);
    try {
      const res = await voteClaimAction({ claimId, type });
      if (!res?.ok || !res.data?.claim) {
        toasts.error(res?.error || 'Failed to vote on claim');
        return;
      }
      const updated = res.data.claim as UiClaim;
      setItems((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated, net: (updated.confirmCount ?? c.confirmCount) - (updated.disputeCount ?? c.disputeCount) } : c)));
    } catch {
      toasts.error('Failed to vote on claim');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-3 rounded-control border border-line/70 bg-canvas/40 p-3" aria-label="Verifiable claims">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Claims to verify</h4>
        <span className="text-[11px] text-ink-3">Confirm or dispute each claim</span>
      </div>
      <ul className="space-y-2">
        {items.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} onVote={onVote} busy={busyId === claim.id} />
        ))}
      </ul>
    </section>
  );
}
