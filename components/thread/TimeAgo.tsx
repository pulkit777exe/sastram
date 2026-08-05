'use client';

import TimeAgo from '@/components/ui/TimeAgo';

interface TimeAgoProps {
  date: Date | string;
}

export default function ThreadTimeAgo({ date }: TimeAgoProps) {
  return (
    <TimeAgo
      date={date}
      className="font-(--font-dm-mono) text-xs uppercase tracking-[0.08em] text-muted-foreground"
    />
  );
}
