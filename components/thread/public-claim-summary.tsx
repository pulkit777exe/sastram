import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { isSafePublicUrl } from '@/lib/services/content-safety';
import type { PublicClaimSummary } from '@/modules/claims/types';

const STATUS_META: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-muted text-ink-2 border-line' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
  DISPUTED: { label: 'Disputed', className: 'bg-red-500/10 text-red-700 border-red-500/20' },
  CONTESTED: { label: 'Contested', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
};

export function PublicClaimSummaryList({ claims }: { claims: PublicClaimSummary[] }) {
  const items = [...claims].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (items.length === 0) return null;

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-card" aria-label="Claim verification summary">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Claim verification</h2>
      <p className="mt-1 text-xs text-ink-3">Community-confirmed status for claims extracted from the synthesized answer.</p>
      <ul className="mt-4 space-y-3">
        {items.map((claim) => {
          const meta = STATUS_META[claim.status] ?? STATUS_META.OPEN;
          const href = claim.sourceUrl && isSafePublicUrl(claim.sourceUrl) ? claim.sourceUrl : null;
          return (
            <li key={claim.id} className="rounded-control border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm leading-relaxed text-ink flex-1 min-w-0">{claim.text}</p>
                <Badge variant="outline" className={cn('shrink-0 text-[11px]', meta.className)}>
                  {meta.label}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span>Confirm {claim.confirmCount}</span>
                <span>Dispute {claim.disputeCount}</span>
                {claim.sourceLabel ? <span>{claim.sourceLabel}</span> : null}
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="text-sai-accent hover:underline">
                    Source
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
