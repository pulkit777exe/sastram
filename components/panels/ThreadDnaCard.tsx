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
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        Thread DNA
      </p>

      <div className="mt-[10px] flex flex-wrap gap-[6px]">
        {/* Question Type */}
        <span
          className={`inline-flex items-center rounded-[999px] px-[10px] py-[4px] text-[11px] font-semibold ${
            QUESTION_TYPE_COLORS[dna.questionType] ?? QUESTION_TYPE_COLORS.other
          }`}
        >
          {dna.questionType}
        </span>

        {/* Expertise Level */}
        <span
          className={`inline-flex items-center rounded-[999px] px-[10px] py-[4px] text-[11px] font-semibold ${
            EXPERTISE_COLORS[dna.expertiseLevel] ?? EXPERTISE_COLORS.beginner
          }`}
        >
          {dna.expertiseLevel}
        </span>

        {/* Topics */}
        {dna.topics.map((topic) => (
          <span
            key={topic}
            className="inline-flex items-center rounded-[999px] bg-(--bg) px-[10px] py-[4px] font-(--font-dm-mono) text-[10px] uppercase tracking-[0.08em] text-(--text)"
          >
            {topic}
          </span>
        ))}
      </div>

      {dna.readTimeMinutes > 0 && (
        <p className="mt-[8px] text-[11px] text-muted-foreground">
          ~{Math.ceil(dna.readTimeMinutes)} min read
        </p>
      )}
    </section>
  );
}
