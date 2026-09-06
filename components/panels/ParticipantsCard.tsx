import { getThreadParticipants } from '@/modules/threads';
import type { ThreadParticipant } from '@/modules/threads';
import { DetailCard } from '@/components/ui/detail-card';

interface ParticipantsCardProps {
  threadId: string;
  ownerId?: string | null;
}

export default async function ParticipantsCard({ threadId, ownerId }: ParticipantsCardProps) {
  let participants: ThreadParticipant[] = [];
  try {
    participants = await getThreadParticipants(threadId);
  } catch {
    participants = [];
  }

  if (participants.length === 0) return null;

  const shown = participants.slice(0, 6);
  const overflow = participants.length - shown.length;
  const ownerFirst = [...shown].sort((a, b) => {
    if (a.id === ownerId) {
      return -1;
    }
    if (b.id === ownerId) {
      return 1;
    }
    return 0;
  });

  return (
    <DetailCard>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
        {participants.length} {participants.length === 1 ? 'person' : 'people'} in this thread
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex -space-x-2">
          {ownerFirst.map((p) => {
            const ownerSuffix = p.id === ownerId ? ' · owner' : '';
            const messageLabel = p.messageCount === 1 ? 'message' : 'messages';
            return (
              <div
                key={p.id}
                title={`${p.name ?? 'Anonymous'}${ownerSuffix} — ${p.messageCount} ${messageLabel}`}
              className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-surface bg-field"
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.name ?? 'User'} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-sai-accent-tint text-xs font-semibold text-sai-accent">
                  {(p.name ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
              {p.id === ownerId && (
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-surface bg-sai-green" />
              )}
            </div>
            );
          })}
        </div>
        {overflow > 0 && <span className="text-xs font-medium text-ink-3">+{overflow}</span>}
      </div>
    </DetailCard>
  );
}
