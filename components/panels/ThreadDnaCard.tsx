import type { ThreadDNA } from "@/lib/schemas/thread-dna";

interface ThreadDnaCardProps {
  dna: ThreadDNA;
}

const QUESTION_TYPE_COLORS: Record<string, string> = {
  factual: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  opinion: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  technical: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  comparison: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  other: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
};

const EXPERTISE_COLORS: Record<string, string> = {
  beginner: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  intermediate: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  advanced: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
  expert: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

export default function ThreadDnaCard({ dna }: ThreadDnaCardProps) {
  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
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
        <p className="mt-[8px] text-[11px] text-muted">
          ~{Math.ceil(dna.readTimeMinutes)} min read
        </p>
      )}
    </section>
  );
}
