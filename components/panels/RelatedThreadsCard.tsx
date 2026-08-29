import Link from 'next/link';
import { getRelatedThreads } from '@/modules/threads';
import type { ThreadDNA } from '@/lib/schemas/thread-dna';
import { DetailCard } from '@/components/ui/detail-card';

interface RelatedThreadsCardProps {
  threadId: string;
}

function formatSimilarity(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export default async function RelatedThreadsCard({ threadId }: RelatedThreadsCardProps) {
  const related = await getRelatedThreads(threadId);

  if (related.length === 0) {
    return null;
  }

  return (
    <DetailCard>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">Related Threads</p>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {related.map((thread) => {
          const dna = thread.threadDna as ThreadDNA | null;
          const topics = dna?.topics ?? [];
          const href = `/dashboard/threads/${thread.slug}`;

          return (
            <Link
              key={thread.id}
              href={href}
              className="group block rounded-control border border-line bg-canvas p-3 transition-colors hover:border-line-strong hover:bg-hover"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug text-ink group-hover:text-ink">
                  {thread.name}
                </span>
                <span className="shrink-0 text-xs font-medium text-ink-3">{formatSimilarity(thread.similarity)}</span>
              </div>

              {topics.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {topics.map((topic: string) => (
                    <span
                      key={topic}
                      className="inline-flex items-center rounded-full bg-field border border-line px-2 py-0.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-2"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </DetailCard>
  );
}
