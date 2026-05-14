import type { ThreadWithFullContext } from '@/modules/threads/queries';

interface ParticipantsCardProps {
  thread: ThreadWithFullContext;
}

export default function ParticipantsCard({ thread }: ParticipantsCardProps) {
  if (!thread.members.length) return null;

  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
        Participants
      </p>

      <div className="mt-[10px] flex flex-wrap gap-[8px]">
        {thread.members.map((member) => (
          <div
            key={member.user.id}
            className="inline-flex items-center gap-[6px] rounded-[999px] bg-(--bg) px-[8px] py-[4px]"
          >
            <div className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-(--blue-dim)">
              <span className="text-[11px] font-medium text-(--blue)">
                {member.user.name?.slice(0, 1).toUpperCase() ?? 'U'}
              </span>
            </div>
            <span className="text-[12px] text-(--text)">{member.user.name ?? 'Unknown'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
