import type { ThreadMessage } from '@/modules/threads';

interface AcceptedAnswerBannerProps {
  answer: ThreadMessage | null;
}

export default function AcceptedAnswerBanner({ answer }: AcceptedAnswerBannerProps) {
  if (!answer) return null;

  return (
    <div className="mb-4 rounded-lg border-chart-2/20 bg-chart-2/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-['Syne'] text-sm font-bold uppercase tracking-[0.16em] text-chart-2">
            Accepted Answer
          </p>
          <p className="mt-1 text-sm text-foreground">
            Marked as the solution for this thread.
          </p>
        </div>
      </div>
    </div>
  );
}
