import { getThreadParticipants } from '@/modules/threads';
import type { ThreadParticipant } from '@/modules/threads';

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
  const ownerFirst = [...shown].sort((a, b) =>
    a.id === ownerId ? -1 : b.id === ownerId ? 1 : 0
  );

  return (
    <section>
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {participants.length} {participants.length === 1 ? 'person' : 'people'} in this thread
      </p>

      <div className="mt-[10px] flex items-center gap-2">
        <div className="flex -space-x-2">
          {ownerFirst.map((p) => (
            <div
              key={p.id}
              title={`${p.name ?? 'Anonymous'}${p.id === ownerId ? ' · owner' : ''} — ${p.messageCount} ${p.messageCount === 1 ? 'message' : 'messages'}`}
              className="relative h-[26px] w-[26px] overflow-hidden rounded-full border-2 border-(--surface) bg-(--bg)"
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.name ?? 'User'} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-(--blue-dim) text-[10px] font-semibold text-(--blue)">
                  {(p.name ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
              {p.id === ownerId && (
                <span className="absolute -bottom-0 -right-0 h-[8px] w-[8px] rounded-full border-2 border-(--surface) bg-(--green)" />
              )}
            </div>
          ))}
        </div>
        {overflow > 0 && (
          <span className="text-[11px] font-medium text-muted-foreground">+{overflow}</span>
        )}
      </div>
    </section>
  );
}
