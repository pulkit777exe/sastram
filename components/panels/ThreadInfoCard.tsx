import type { ThreadWithFullContext } from '@/modules/threads/queries';

interface ThreadInfoCardProps {
  thread: ThreadWithFullContext;
}

export default function ThreadInfoCard({ thread }: ThreadInfoCardProps) {
  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
        Thread information
      </p>

      <div className="mt-[12px] space-y-[8px] text-[13px] text-muted">
        <div className="flex items-center justify-between">
          <span>Messages</span>
          <span className="font-['Syne'] text-[16px] font-bold text-(--text)">
            {thread._count.messages}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Participants</span>
          <span className="font-['Syne'] text-[16px] font-bold text-(--text)">
            {thread._count.members}
          </span>
        </div>
      </div>

      {thread.tags.length > 0 && (
        <div className="mt-[12px] flex flex-wrap gap-[6px]">
          {thread.tags.map((tag) => (
            <span
              key={tag.tag.name}
              className="rounded-[999px] bg-(--blue-dim) px-[8px] py-[4px] font-(--font-dm-mono) text-[10px] uppercase tracking-[0.12em] text-(--blue)"
            >
              {tag.tag.name}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
