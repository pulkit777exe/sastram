"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

interface TimeAgoProps {
  date: Date | string;
}

export default function TimeAgo({ date }: TimeAgoProps) {
  const value = useMemo(
    () =>
      formatDistanceToNow(typeof date === "string" ? new Date(date) : date, {
        addSuffix: true,
      }),
    [date],
  );

  return (
    <span className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.08em] text-muted">
      {value}
    </span>
  );
}

