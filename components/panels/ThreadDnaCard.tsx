import type { ThreadDNA } from '@/lib/schemas/thread-dna';

interface ThreadDnaCardProps {
  dna: ThreadDNA;
}

const QUESTION_TYPE_COLORS: Record<string, string> = {
  factual: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  opinion: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  technical: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  comparison: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  other: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
};

const EXPERTISE_COLORS: Record<string, string> = {
  beginner: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  intermediate: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  advanced: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  expert: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
};

export default function ThreadDnaCard({ dna }: ThreadDnaCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="font-(--font-dm-mono) text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Thread DNA
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {/* Question Type */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            QUESTION_TYPE_COLORS[dna.questionType] ?? QUESTION_TYPE_COLORS.other
          }`}
        >
          {dna.questionType}
        </span>

        {/* Expertise Level */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            EXPERTISE_COLORS[dna.expertiseLevel] ?? EXPERTISE_COLORS.beginner
          }`}
        >
          {dna.expertiseLevel}
        </span>

        {/* Topics */}
        {dna.topics.map((topic) => (
          <span
            key={topic}
            className="inline-flex items-center rounded-full bg-background px-2.5 py-1 font-(--font-dm-mono) text-xs uppercase tracking-[0.08em] text-foreground"
          >
            {topic}
          </span>
        ))}
      </div>

      {dna.readTimeMinutes > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          ~{Math.ceil(dna.readTimeMinutes)} min read
        </p>
      )}
    </section>
  );
}
