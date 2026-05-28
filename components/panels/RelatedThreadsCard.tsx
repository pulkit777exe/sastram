import Link from 'next/link';
import { getRelatedThreads } from '@/modules/threads/relations';
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
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
        Related Threads
      </p>

      <div className="mt-[10px] flex flex-col gap-[10px]">
        {related.map((thread) => {
          const dna = thread.threadDna as ThreadDNA | null;
          const topics = dna?.topics ?? [];
          const href = thread.community
            ? `/${thread.community.slug}/${thread.slug}`
            : `/sections/${thread.slug}`;

          return (
            <Link
              key={thread.id}
              href={href}
              className="group block rounded-[8px] border border-border/50 p-[12px] transition-colors hover:border-border hover:bg-(--bg)"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold leading-snug text-(--text) group-hover:text-(--accent)">
                  {thread.name}
                </span>
                <span className="shrink-0 text-[11px] font-medium text-muted">
                  {formatSimilarity(thread.similarity)}
                </span>
              </div>

              {topics.length > 0 && (
                <div className="mt-[6px] flex flex-wrap gap-[4px]">
                  {topics.map((topic: string) => (
                    <span
                      key={topic}
                      className="inline-flex items-center rounded-[999px] bg-(--bg) px-[8px] py-[2px] font-(--font-dm-mono) text-[9px] uppercase tracking-[0.08em] text-(--text)"
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
