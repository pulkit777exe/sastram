import type { ThreadMessage } from "@/modules/threads/queries";

interface AcceptedAnswerBannerProps {
  answer: ThreadMessage | null;
}

export default function AcceptedAnswerBanner({
  answer,
}: AcceptedAnswerBannerProps) {
  if (!answer) return null;

  return (
    <div className="mb-[16px] rounded-[10px] border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] p-[12px]">
      <div className="flex items-center justify-between gap-[8px]">
        <div>
          <p className="font-['Syne'] text-[13px] font-bold uppercase tracking-[0.16em] text-(--green)">
            Accepted Answer
          </p>
          <p className="mt-[4px] text-[13px] text-(--text)">
            Marked as the solution for this thread.
          </p>
        </div>
      </div>
    </div>
  );
}

