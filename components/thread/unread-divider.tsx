export function UnreadDivider() {
  return (
    <div className="flex items-center gap-2.5 my-3" role="separator" aria-label="New messages indicator">
      <div className="flex-1 h-px bg-rose-500/30" />
      <span className="text-[11px] text-rose-500 font-bold uppercase tracking-wider whitespace-nowrap bg-background px-2.5">
        New messages
      </span>
      <div className="flex-1 h-px bg-rose-500/30" />
    </div>
  );
}
