import type { ThreadWithFullContext } from "@/modules/threads/queries";
import ThreadInfoCard from "./ThreadInfoCard";
import ResolutionScoreCard from "./ResolutionScoreCard";
import AiSynthesisCard from "./AiSynthesisCard";
import ParticipantsCard from "./ParticipantsCard";

interface RightPanelProps {
  thread: ThreadWithFullContext;
}

export default function RightPanel({ thread }: RightPanelProps) {
  const defaultBreakdown = {
    quality: thread.resolutionScore ?? 0,
    sources: Math.min(100, (thread.resolutionScore ?? 0) + 10),
    votes: Math.max(0, (thread.resolutionScore ?? 0) - 10),
  };

  return (
    <div className="flex h-full flex-col gap-[16px]">
      <ThreadInfoCard thread={thread} />
      <ResolutionScoreCard score={thread.resolutionScore} breakdown={defaultBreakdown} />
      <AiSynthesisCard
        summary={thread.aiSummary}
        sources={thread.aiSearchSession?.results ?? []}
        lastUpdated={thread.aiSearchSession?.lastUpdated ?? null}
        threadId={thread.id}
      />
      <ParticipantsCard thread={thread} />
    </div>
  );
}

