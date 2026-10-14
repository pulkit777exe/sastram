'use client';

import { useMemo } from 'react';
import { formatDistance } from 'date-fns';
import { useNow } from './use-now';

interface TimeAgoProps {
  date: Date | string | number;
  className?: string;
}

// Matches trailing timezone: 'Z' or '+HH:MM' / '-HH:MM'
const TIMEZONE_SUFFIX_RE = /(?:Z|[+\-]\d{2}:\d{2})$/i;
// Checks if string contains an ISO date-time separator
const ISO_DATETIME_RE = /T/;

function parseTimestamp(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  const normalized = value.trim();
  // Some backend payloads can arrive without timezone (UTC by convention).
  // Add `Z` so the browser does not interpret them as local time.
  const hasTimezone = TIMEZONE_SUFFIX_RE.test(normalized);
  const isIsoDateTime = ISO_DATETIME_RE.test(normalized);
  const needsUtcSuffix = !hasTimezone && isIsoDateTime;

  if (needsUtcSuffix) return new Date(`${normalized}Z`);
  return new Date(normalized);
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  // Re-renders on the shared 30s tab clock — no per-instance timer.
  const now = useNow();
  const parsed = useMemo(() => parseTimestamp(date), [date]);
  const label = formatDistance(parsed, now, { addSuffix: true });

  return (
    <time
      dateTime={parsed.toISOString()}
      className={className}
      suppressHydrationWarning
      title={label}
    >
      {label}
    </time>
  );
}

export default TimeAgo;
