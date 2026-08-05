import Link from 'next/link';
import { getRelatedThreads } from '@/modules/threads';
import type { ThreadDNA } from '@/lib/schemas/thread-dna';

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
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="font-(--font-dm-mono) text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Related Threads
      </p>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {related.map((thread) => {
          const dna = thread.threadDna as ThreadDNA | null;
          const topics = dna?.topics ?? [];
          const href = `/dashboard/threads/${thread.slug}`;

          return (
            <Link
              key={thread.id}
              href={href}
              className="group block rounded-lg border border-border/50 p-3 transition-colors hover:border-border hover:bg-background"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug text-foreground group-hover:text-foreground">
                  {thread.name}
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {formatSimilarity(thread.similarity)}
                </span>
              </div>

              {topics.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {topics.map((topic: string) => (
                    <span
                      key={topic}
                      className="inline-flex items-center rounded-full bg-background px-2 py-0.5 font-(--font-dm-mono) text-xs uppercase tracking-[0.08em] text-foreground"
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
    </section>
  );
}
