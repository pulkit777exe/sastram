import type { ThreadWithFullContext } from '@/modules/threads/queries';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import ThreadInfoCard from './ThreadInfoCard';
import ResolutionScoreCard from './ResolutionScoreCard';
import AiSynthesisCard from './AiSynthesisCard';
import ParticipantsCard from './ParticipantsCard';
import ThreadDnaCard from './ThreadDnaCard';

interface RightPanelProps {
  thread: ThreadWithFullContext;
}

export default function RightPanel({ thread }: RightPanelProps) {
  // Parse threadDna through Zod before use
  const threadDna = parseThreadDna(thread.threadDna);

  return (
    <div className="flex h-full flex-col gap-[16px]">
      <ThreadInfoCard thread={thread} />
      <ResolutionScoreCard score={thread.resolutionScore} />
      {threadDna && <ThreadDnaCard dna={threadDna} />}
      <AiSynthesisCard
        summary={thread.aiSummary}
        sources={thread.aiSearchSession?.results ?? []}
        lastUpdated={thread.aiSearchSession?.lastUpdated ?? null}
        threadId={thread.id}
        messageCount={thread._count.messages}
      />
      <ParticipantsCard thread={thread} />
    </div>
  );
}
