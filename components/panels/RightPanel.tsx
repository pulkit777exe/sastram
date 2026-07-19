import type { ThreadWithFullContext } from '@/modules/threads';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import ThreadInfoCard from './ThreadInfoCard';
import AiSynthesisCard from './AiSynthesisCard';
import ParticipantsCard from './ParticipantsCard';
import ThreadDnaCard from './ThreadDnaCard';
import RelatedThreadsCard from './RelatedThreadsCard';

interface RightPanelProps {
  thread: ThreadWithFullContext;
}

export default function RightPanel({ thread }: RightPanelProps) {
  // Parse threadDna through Zod before use
  const threadDna = parseThreadDna(thread.threadDna);

  return (
    <div className="flex h-full flex-col gap-[16px]">
      <ThreadInfoCard thread={thread} />
      {threadDna && <ThreadDnaCard dna={threadDna} />}
      <AiSynthesisCard
        summary={thread.aiSummary}
        sources={thread.aiSearchSession?.results ?? []}
        lastUpdated={thread.aiSearchSession?.lastUpdated ?? null}
        threadId={thread.id}
        messageCount={thread._count.messages}
      />
      <RelatedThreadsCard threadId={thread.id} />
      <ParticipantsCard threadId={thread.id} ownerId={thread.createdBy} />
    </div>
  );
}
