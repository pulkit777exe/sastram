interface ResolutionBreakdown {
  quality: number;
  sources: number;
  votes: number;
}

interface ResolutionScoreCardProps {
  score: number | null;
  breakdown: ResolutionBreakdown;
}

const CIRCUMFERENCE = 201;

export default function ResolutionScoreCard({
  score,
  breakdown,
}: ResolutionScoreCardProps) {
  const safeScore = Math.max(0, Math.min(100, score ?? 0));
  const offset = CIRCUMFERENCE * (1 - safeScore / 100);

  const colorVar =
    safeScore >= 70 ? "var(--green)" : safeScore >= 40 ? "var(--amber)" : "var(--red)";

  const bar = (value: number, color: string) => (
    <div className="h-[6px] w-full rounded-[999px] bg-(--bg)">
      <div
        className="h-full rounded-[999px]"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );

  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
        Resolution score
      </p>

      <div className="mt-[12px] flex items-center gap-[16px]">
        <div className="relative h-[80px] w-[80px]">
          <svg
            viewBox="0 0 80 80"
            className="h-full w-full -rotate-90"
          >
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke="#e4e4e7"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke={colorVar}
              strokeWidth="6"
              fill="none"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{
                transition: "stroke-dashoffset 1s ease",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-['Syne'] text-[20px] font-extrabold text-(--text)">
              {safeScore}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-[8px] text-[12px] text-muted">
          <div>
            <div className="mb-[4px] flex items-center justify-between">
              <span>Answer quality</span>
              <span className="font-['Syne'] text-[13px] text-(--text)">
                {breakdown.quality}%
              </span>
            </div>
            {bar(breakdown.quality, "var(--green)")}
          </div>
          <div>
            <div className="mb-[4px] flex items-center justify-between">
              <span>Sources</span>
              <span className="font-['Syne'] text-[13px] text-(--text)">
                {breakdown.sources}%
              </span>
            </div>
            {bar(breakdown.sources, "var(--blue)")}
          </div>
          <div>
            <div className="mb-[4px] flex items-center justify-between">
              <span>Community votes</span>
              <span className="font-['Syne'] text-[13px] text-(--text)">
                {breakdown.votes}%
              </span>
            </div>
            {bar(breakdown.votes, "var(--amber)")}
          </div>
        </div>
      </div>
    </section>
  );
}

