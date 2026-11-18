import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Hash } from 'lucide-react';
import { getSession } from '@/modules/auth';
import { getTagBySlug, getTagCredibilitySummary, getThreadsByTag } from '@/modules/tags';
import { TopicGrid } from '@/components/dashboard/topic-grid';
import { Button } from '@/components/ui/button';

export default async function TagDetailPage({ params }: { params: { slug: string } }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return null;

  const tag = await getTagBySlug(slug, session.user.id, session.user.role);
  if (!tag) notFound();

  const [threads, credibility] = await Promise.all([
    getThreadsByTag(tag.id, session.user.id, session.user.role),
    getTagCredibilitySummary(tag.id, session.user.id, session.user.role),
  ]);
  const threadLabel = tag.threadCount === 1 ? 'thread' : 'threads';
  const credibilityTone =
    credibility.level === 'SUPPORTED'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
      : credibility.level === 'MIXED'
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200'
        : credibility.level === 'EMERGING'
          ? 'border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-200'
          : 'border-line bg-muted/40 text-ink-2';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="rounded-card border border-line admin-header-gradient p-4 md:p-8 text-white shadow-linear-xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-card flex items-center justify-center"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
          >
            <Hash size={20} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold">#{tag.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tag.threadCount} {threadLabel}</p>
          </div>
        </div>
      </header>

      <section className="rounded-card border border-line bg-surface p-4 md:p-5" aria-label="Topic credibility">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Topic credibility</h2>
            <p className="mt-1 text-xs text-ink-3">
              Derived on demand from existing visible thread and claim signals (AI/community-derived, heuristic, not
              authoritative and not user expertise). Values can change as threads, claims, or votes change.
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${credibilityTone}`}>
            {credibility.label}
          </span>
        </div>
        <p className="mt-3 text-sm text-ink-2">{credibility.description}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-control border border-line bg-canvas/50 px-3 py-2">
            <dt className="text-ink-3">Visible threads</dt>
            <dd className="mt-0.5 font-medium text-ink">{credibility.threadCount}</dd>
          </div>
          <div className="rounded-control border border-line bg-canvas/50 px-3 py-2">
            <dt className="text-ink-3">Resolved threads</dt>
            <dd className="mt-0.5 font-medium text-ink">{credibility.resolvedThreadCount}</dd>
          </div>
          <div className="rounded-control border border-line bg-canvas/50 px-3 py-2">
            <dt className="text-ink-3">Claims</dt>
            <dd className="mt-0.5 font-medium text-ink">{credibility.totalClaims}</dd>
          </div>
          <div className="rounded-control border border-line bg-canvas/50 px-3 py-2">
            <dt className="text-ink-3">Confirm / Dispute votes</dt>
            <dd className="mt-0.5 font-medium text-ink">{credibility.confirmVotes} / {credibility.disputeVotes}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-ink-3">
          Claim statuses: {credibility.byStatus.CONFIRMED} confirmed, {credibility.byStatus.OPEN} open, {credibility.byStatus.CONTESTED} contested, {credibility.byStatus.DISPUTED} disputed.
        </p>
      </section>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Hash size={22} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-ink">No threads with this tag</p>
          <p className="text-sm text-ink-3 mt-1 max-w-sm">Threads tagged with #{tag.name} will appear here.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/threads">Browse threads</Link>
          </Button>
        </div>
      ) : (
        <TopicGrid topics={threads} />
      )}
    </div>
  );
}
