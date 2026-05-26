import React from 'react';

interface DayDividerProps {
  date: Date | string;
}

export function DayDivider({ date }: DayDividerProps) {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const formatDate = (dateVal: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateVal.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (dateVal.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return dateVal.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
  };

  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-background px-2.5">
        {formatDate(d)}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}
