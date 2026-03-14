"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface TimeAgoProps {
  date: Date | string | number;
  className?: string;
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  const [label, setLabel] = useState(() =>
    formatDistanceToNow(new Date(date), { addSuffix: true }),
  );

  useEffect(() => {
    const update = () =>
      setLabel(formatDistanceToNow(new Date(date), { addSuffix: true }));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  );
}

export default TimeAgo;
