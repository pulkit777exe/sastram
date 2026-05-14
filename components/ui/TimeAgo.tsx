'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface TimeAgoProps {
  date: Date | string | number;
  className?: string;
}

function parseTimestamp(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  const normalized = value.trim();
  // Some backend payloads can arrive without timezone (UTC by convention).
  // Add `Z` so the browser does not interpret them as local time.
  const hasTimezone = /(?:Z|[+\-]\d{2}:\d{2})$/i.test(normalized);
  const needsUtcSuffix = !hasTimezone && /T/.test(normalized);

  return new Date(needsUtcSuffix ? `${normalized}Z` : normalized);
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  const [label, setLabel] = useState(() =>
    formatDistanceToNow(parseTimestamp(date), { addSuffix: true })
  );

  useEffect(() => {
    const update = () => setLabel(formatDistanceToNow(parseTimestamp(date), { addSuffix: true }));
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
