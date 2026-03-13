"use client";

import TimeAgo from "@/components/ui/TimeAgo";

interface TimeAgoProps {
  date: Date | string;
}

export default function ThreadTimeAgo({ date }: TimeAgoProps) {
  return (
    <TimeAgo
      date={date}
      className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.08em] text-muted"
    />
  );
}
