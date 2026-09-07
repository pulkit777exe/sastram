import { getThreadParticipants } from '@/modules/threads';
import type { ThreadParticipant } from '@/modules/threads';
import { DetailCard } from '@/components/ui/detail-card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

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
              <Avatar
                key={p.id}
                title={`${p.name ?? 'Anonymous'}${ownerSuffix} — ${p.messageCount} ${messageLabel}`}
                className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-surface bg-field"
              >
                {p.image ? (
                  <AvatarImage src={p.image} alt={p.name ?? 'User'} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-xs font-semibold text-sai-accent bg-sai-accent-tint">
                    {(p.name ?? 'U').charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
                {p.id === ownerId && (
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-surface bg-sai-green" />
                )}
              </Avatar>
            );
          })}
        </div>
        {overflow > 0 && <span className="text-xs font-medium text-ink-3">+{overflow}</span>}
      </div>
    </DetailCard>
  );
}
